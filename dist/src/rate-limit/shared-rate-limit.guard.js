"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
var SharedRateLimitGuard_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.SharedRateLimitGuard = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const jwt_1 = require("@nestjs/jwt");
const node_crypto_1 = require("node:crypto");
const ioredis_1 = __importDefault(require("ioredis"));
const script = `
local result={}
for i,key in ipairs(KEYS) do
 local hits=redis.call('INCR',key)
 if hits==1 then redis.call('PEXPIRE',key,ARGV[1]) end
 local ttl=redis.call('PTTL',key)
 if ttl<0 then redis.call('PEXPIRE',key,ARGV[1]);ttl=tonumber(ARGV[1]) end
 table.insert(result,hits);table.insert(result,ttl)
end
return result`;
let SharedRateLimitGuard = SharedRateLimitGuard_1 = class SharedRateLimitGuard {
    config;
    redis;
    jwt = new jwt_1.JwtService();
    logger = new common_1.Logger(SharedRateLimitGuard_1.name);
    constructor(config) {
        this.config = config;
        this.redis = new ioredis_1.default({
            host: config.getOrThrow('REDIS_HOST'),
            port: config.getOrThrow('REDIS_PORT'),
            keyPrefix: '',
            lazyConnect: true,
            enableOfflineQueue: false,
            maxRetriesPerRequest: 1,
            connectTimeout: 1000,
            commandTimeout: 1000,
            retryStrategy: (attempt) => Math.min(attempt * 250, 2000),
        });
        this.redis.on('error', () => { });
        void this.redis.connect().catch(() => { });
    }
    onModuleDestroy() {
        this.redis.disconnect();
    }
    hash(value) {
        return (0, node_crypto_1.createHash)('sha256').update(value).digest('hex');
    }
    async canActivate(context) {
        if (context.getClass().name === 'PaystackController' && context.getHandler().name === 'receive')
            return true;
        const req = context.switchToHttp().getRequest();
        const res = context.switchToHttp().getResponse();
        const path = req.originalUrl.split('?')[0];
        const policy = path === '/api/v1/auth/login'
            ? 'login'
            : req.method === 'GET' || req.method === 'HEAD'
                ? 'read'
                : path === '/api/v1/wallet/transfer' || path === '/api/v1/wallet/payouts'
                    ? 'money'
                    : 'write';
        const ip = req.ip ?? req.socket.remoteAddress ?? 'unknown';
        const keys = [`wallet:rate:v1:{shared}:${policy}:ip:${this.hash(ip)}`];
        const defaults = { login: [10, 5], money: [20, 10], read: [120, 120], write: [30, 20] };
        const limits = [
            this.config.get(`RATE_${policy.toUpperCase()}_IP_LIMIT`) ?? defaults[policy][0],
        ];
        if (policy === 'login') {
            const email = typeof req.body?.email === 'string'
                ? req.body.email.trim().toLowerCase().slice(0, 320)
                : null;
            if (email) {
                keys.push(`wallet:rate:v1:{shared}:login:account:${this.hash(email)}`);
                limits.push(this.config.get('RATE_LOGIN_ACCOUNT_LIMIT') ?? 5);
            }
        }
        else {
            const bearer = req.headers.authorization;
            if (typeof bearer === 'string' && bearer.startsWith('Bearer ') && bearer.length <= 4096) {
                try {
                    const payload = await this.jwt.verifyAsync(bearer.slice(7), { secret: this.config.getOrThrow('JWT_SECRET'), algorithms: ['HS256'] });
                    if (payload.kind === 'access' &&
                        typeof payload.sub === 'string' &&
                        payload.sub.length <= 100) {
                        keys.push(`wallet:rate:v1:{shared}:${policy}:account:${this.hash(payload.sub)}`);
                        limits.push(this.config.get(`RATE_${policy.toUpperCase()}_ACCOUNT_LIMIT`) ??
                            defaults[policy][1]);
                    }
                }
                catch {
                }
            }
        }
        let result;
        try {
            result = await this.redis.eval(script, keys.length, ...keys, 60000);
        }
        catch {
            this.logger.warn('Shared rate limiting unavailable');
            throw new common_1.ServiceUnavailableException('Request protection temporarily unavailable');
        }
        if (!Array.isArray(result) ||
            result.length !== keys.length * 2 ||
            !result.every((value) => typeof value === 'number' && Number.isFinite(value)))
            throw new common_1.ServiceUnavailableException('Request protection temporarily unavailable');
        const counts = result;
        let remaining = Infinity;
        let retry = 0;
        for (let i = 0; i < keys.length; i++) {
            remaining = Math.min(remaining, Math.max(0, limits[i] - counts[i * 2]));
            if (counts[i * 2] > limits[i])
                retry = Math.max(retry, Math.ceil(counts[i * 2 + 1] / 1000));
        }
        res.setHeader('X-RateLimit-Policy', policy);
        res.setHeader('X-RateLimit-Remaining', remaining);
        res.setHeader('X-RateLimit-Reset', Math.ceil(Math.max(...counts.filter((_, i) => i % 2 === 1)) / 1000));
        if (retry) {
            res.setHeader('Retry-After', retry);
            throw new common_1.HttpException('Too many requests. Retry after the indicated delay.', 429);
        }
        return true;
    }
};
exports.SharedRateLimitGuard = SharedRateLimitGuard;
exports.SharedRateLimitGuard = SharedRateLimitGuard = SharedRateLimitGuard_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [config_1.ConfigService])
], SharedRateLimitGuard);
//# sourceMappingURL=shared-rate-limit.guard.js.map