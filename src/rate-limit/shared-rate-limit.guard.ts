import {
  CanActivate,
  ExecutionContext,
  Injectable,
  Logger,
  OnModuleDestroy,
  ServiceUnavailableException,
  HttpException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { createHash } from 'node:crypto';
import type { Request, Response } from 'express';
import Redis from 'ioredis';

// One atomic fixed-window update across IP and account buckets, using Redis TTLs.
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
type Policy = 'login' | 'money' | 'read' | 'write';
@Injectable()
export class SharedRateLimitGuard implements CanActivate, OnModuleDestroy {
  private readonly redis: Redis;
  private readonly jwt = new JwtService();
  private lastWarningAt = 0;
  private readonly logger = new Logger(SharedRateLimitGuard.name);
  constructor(private readonly config: ConfigService) {
    this.redis = new Redis({
      host: config.getOrThrow<string>('REDIS_HOST'),
      port: config.getOrThrow<number>('REDIS_PORT'),
      keyPrefix: '',
      lazyConnect: true,
      enableOfflineQueue: false,
      maxRetriesPerRequest: 1,
      connectTimeout: 1000,
      commandTimeout: 1000,
      retryStrategy: (attempt) => Math.min(attempt * 250, 2000),
    });
    this.redis.on('error', () => {}); // Request failures are sanitized below; never log Redis connection details.
    void this.redis.connect().catch(() => {});
  }
  onModuleDestroy() {
    this.redis.disconnect();
  }
  private hash(value: string) {
    return createHash('sha256').update(value).digest('hex');
  }
  async canActivate(context: ExecutionContext) {
    // Provider webhook has signature checks and durable duplicate protection; do not block retries by IP.
    if (context.getClass().name === 'PaystackController' && context.getHandler().name === 'receive')
      return true;
    const req = context
      .switchToHttp()
      .getRequest<Request<Record<string, string>, unknown, Record<string, unknown>>>();
    const res = context.switchToHttp().getResponse<Response>();
    const controller = context.getClass().name;
    const handler = context.getHandler().name;
    const policy: Policy =
      controller === 'AuthController' && handler === 'login'
        ? 'login'
        : req.method === 'GET' || req.method === 'HEAD'
          ? 'read'
          : (controller === 'WalletController' && handler === 'transfer') ||
              (controller === 'PayoutsController' && handler === 'create')
            ? 'money'
            : 'write';
    const ip = req.ip ?? req.socket.remoteAddress ?? 'unknown';
    const keys = [`wallet:rate:v1:{shared}:${policy}:ip:${this.hash(ip)}`];
    const defaults = { login: [10, 5], money: [20, 10], read: [120, 120], write: [30, 20] };
    const limits = [
      this.config.get<number>(`RATE_${policy.toUpperCase()}_IP_LIMIT`) ?? defaults[policy][0],
    ];
    if (policy === 'login') {
      const email =
        typeof req.body?.email === 'string'
          ? req.body.email.trim().toLowerCase().slice(0, 320)
          : null;
      if (email) {
        keys.push(`wallet:rate:v1:{shared}:login:account:${this.hash(email)}`);
        limits.push(this.config.get<number>('RATE_LOGIN_ACCOUNT_LIMIT') ?? 5);
      }
    } else {
      const bearer = req.headers.authorization;
      const match =
        typeof bearer === 'string' && bearer.length <= 4096
          ? /^Bearer\s+(\S+)$/i.exec(bearer)
          : null;
      if (match) {
        try {
          const payload = await this.jwt.verifyAsync<{ sub?: string; kind?: string }>(match[1], {
            secret: this.config.getOrThrow<string>('JWT_SECRET'),
            algorithms: ['HS256'],
          });
          if (
            payload.kind === 'access' &&
            typeof payload.sub === 'string' &&
            payload.sub.length <= 100
          ) {
            keys.push(`wallet:rate:v1:{shared}:${policy}:account:${this.hash(payload.sub)}`);
            limits.push(
              this.config.get<number>(`RATE_${policy.toUpperCase()}_ACCOUNT_LIMIT`) ??
                defaults[policy][1],
            );
          }
        } catch {
          /* Invalid credentials still consume the IP bucket; route auth rejects them. */
        }
      }
    }
    let result: unknown;
    try {
      result = await this.redis.eval(script, keys.length, ...keys, 60000);
    } catch {
      if (Date.now() - this.lastWarningAt > 30000) {
        this.logger.warn('Shared rate limiting unavailable');
        this.lastWarningAt = Date.now();
      }
      throw new ServiceUnavailableException('Request protection temporarily unavailable');
    }
    if (
      !Array.isArray(result) ||
      result.length !== keys.length * 2 ||
      !result.every((value) => typeof value === 'number' && Number.isFinite(value))
    )
      throw new ServiceUnavailableException('Request protection temporarily unavailable');
    const counts = result as number[];
    let remaining = Infinity;
    let retry = 0;
    for (let i = 0; i < keys.length; i++) {
      remaining = Math.min(remaining, Math.max(0, limits[i] - counts[i * 2]));
      if (counts[i * 2] > limits[i]) retry = Math.max(retry, Math.ceil(counts[i * 2 + 1] / 1000));
    }
    res.setHeader('X-RateLimit-Policy', policy);
    res.setHeader('X-RateLimit-Limit-IP', limits[0]);
    if (limits.length > 1) res.setHeader('X-RateLimit-Limit-Account', limits[1]);
    res.setHeader('X-RateLimit-Remaining', remaining);
    res.setHeader(
      'X-RateLimit-Reset',
      Math.ceil(Math.max(...counts.filter((_, i) => i % 2 === 1)) / 1000),
    );
    if (retry) {
      res.setHeader('Retry-After', retry);
      throw new HttpException('Too many requests. Retry after the indicated delay.', 429);
    }
    return true;
  }
}
