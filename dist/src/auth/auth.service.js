"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AuthService = void 0;
const common_1 = require("@nestjs/common");
const jwt_1 = require("@nestjs/jwt");
const config_1 = require("@nestjs/config");
const users_service_1 = require("../users/users.service");
const prisma_service_1 = require("../prisma/prisma.service");
const bcrypt = __importStar(require("bcrypt"));
const node_crypto_1 = require("node:crypto");
const class_validator_1 = require("class-validator");
let AuthService = class AuthService {
    usersService;
    jwtService;
    configService;
    prisma;
    constructor(usersService, jwtService, configService, prisma) {
        this.usersService = usersService;
        this.jwtService = jwtService;
        this.configService = configService;
        this.prisma = prisma;
    }
    register(dto) {
        return this.usersService.create(dto);
    }
    async login(dto, userAgent) {
        const user = await this.usersService.findByEmail(dto.email);
        if (!user?.isActive || user.closedAt || !(await bcrypt.compare(dto.password, user.password)))
            throw new common_1.UnauthorizedException('Invalid credentials');
        return this.generateTokens(user, userAgent);
    }
    async tokens(user, sid, expiresAt) {
        const jti = (0, node_crypto_1.randomUUID)();
        const payload = { sub: user.id, sid, email: user.email, authVersion: user.authVersion };
        const remaining = Math.floor((expiresAt.getTime() - Date.now()) / 1000);
        if (remaining <= 0)
            throw new common_1.UnauthorizedException('Session expired');
        const [accessToken, refreshToken] = await Promise.all([
            this.jwtService.signAsync({ ...payload, kind: 'access', jti: (0, node_crypto_1.randomUUID)() }),
            this.jwtService.signAsync({ ...payload, kind: 'refresh', jti }, {
                secret: this.configService.getOrThrow('REFRESH_SECRET'),
                expiresIn: remaining,
            }),
        ]);
        return {
            jti,
            hash: (0, node_crypto_1.createHash)('sha256').update(refreshToken).digest('hex'),
            response: {
                accessToken,
                refreshToken,
                sessionId: sid,
                sessionExpiresAt: expiresAt,
                user: {
                    id: user.id,
                    email: user.email,
                    firstName: user.firstName,
                    lastName: user.lastName,
                    role: user.role,
                },
            },
        };
    }
    async generateTokens(expected, userAgent) {
        return this.prisma.$transaction(async (tx) => {
            await tx.$queryRaw `SELECT id FROM users WHERE id=${expected.id} FOR UPDATE`;
            const user = await tx.user.findUnique({ where: { id: expected.id } });
            if (!user?.isActive ||
                user.closedAt ||
                user.authVersion !== expected.authVersion ||
                user.password !== expected.password)
                throw new common_1.UnauthorizedException('Authentication changed; log in again');
            const sid = (0, node_crypto_1.randomUUID)();
            const expiresAt = new Date(Date.now() + this.configService.getOrThrow('REFRESH_EXPIRES_IN') * 1000);
            const issued = await this.tokens(user, sid, expiresAt);
            await tx.authSession.create({
                data: { id: sid, userId: user.id, userAgent: userAgent?.slice(0, 512) || null, expiresAt },
            });
            await tx.sessionRefreshToken.create({
                data: { id: issued.jti, sessionId: sid, tokenHash: issued.hash, expiresAt },
            });
            await tx.auditLog.create({
                data: { userId: user.id, action: 'SESSION_CREATED', metadata: { sessionId: sid } },
            });
            return issued.response;
        });
    }
    async refreshPayload(token) {
        try {
            if (typeof token !== 'string' || token.length > 4096)
                throw new Error();
            const payload = await this.jwtService.verifyAsync(token, {
                secret: this.configService.getOrThrow('REFRESH_SECRET'),
            });
            if (payload.kind !== 'refresh' ||
                !(0, class_validator_1.isUUID)(payload.sub) ||
                !(0, class_validator_1.isUUID)(payload.sid) ||
                !(0, class_validator_1.isUUID)(payload.jti) ||
                !Number.isInteger(payload.authVersion))
                throw new Error();
            return payload;
        }
        catch {
            throw new common_1.UnauthorizedException('Invalid refresh token');
        }
    }
    async refreshTokens(refreshToken) {
        const payload = await this.refreshPayload(refreshToken);
        const hash = (0, node_crypto_1.createHash)('sha256').update(refreshToken).digest('hex');
        const result = await this.prisma.$transaction(async (tx) => {
            await tx.$queryRaw `SELECT id FROM users WHERE id=${payload.sub} FOR UPDATE`;
            const user = await tx.user.findUnique({ where: { id: payload.sub } });
            const session = await tx.authSession.findUnique({ where: { id: payload.sid } });
            const token = await tx.sessionRefreshToken.findUnique({ where: { id: payload.jti } });
            if (!user?.isActive ||
                user.closedAt ||
                user.authVersion !== payload.authVersion ||
                !session ||
                session.userId !== user.id ||
                session.revokedAt ||
                session.expiresAt <= new Date() ||
                !token ||
                token.sessionId !== session.id ||
                token.tokenHash !== hash ||
                token.expiresAt <= new Date())
                return null;
            if (token.consumedAt) {
                await tx.authSession.update({
                    where: { id: session.id },
                    data: { revokedAt: new Date(), revokeReason: 'REFRESH_REUSE' },
                });
                await tx.auditLog.create({
                    data: {
                        userId: user.id,
                        action: 'REFRESH_TOKEN_REUSE',
                        metadata: { sessionId: session.id },
                    },
                });
                return null;
            }
            const issued = await this.tokens(user, session.id, session.expiresAt);
            await tx.sessionRefreshToken.update({
                where: { id: token.id },
                data: { consumedAt: new Date() },
            });
            await tx.sessionRefreshToken.create({
                data: {
                    id: issued.jti,
                    sessionId: session.id,
                    tokenHash: issued.hash,
                    expiresAt: session.expiresAt,
                },
            });
            await tx.authSession.update({ where: { id: session.id }, data: { lastUsedAt: new Date() } });
            return issued.response;
        });
        if (!result)
            throw new common_1.UnauthorizedException('Invalid refresh token; log in again');
        return result;
    }
    async logout(refreshToken) {
        let payload;
        try {
            payload = await this.refreshPayload(refreshToken);
        }
        catch {
            return;
        }
        const hash = (0, node_crypto_1.createHash)('sha256').update(refreshToken).digest('hex');
        await this.prisma.$transaction(async (tx) => {
            await tx.$queryRaw `SELECT id FROM users WHERE id=${payload.sub} FOR UPDATE`;
            const user = await tx.user.findUnique({ where: { id: payload.sub } });
            const token = await tx.sessionRefreshToken.findUnique({ where: { id: payload.jti } });
            if (!user ||
                user.authVersion !== payload.authVersion ||
                !token ||
                token.sessionId !== payload.sid ||
                token.tokenHash !== hash)
                return;
            const changed = await tx.authSession.updateMany({
                where: { id: payload.sid, userId: user.id, revokedAt: null },
                data: { revokedAt: new Date(), revokeReason: 'LOGOUT' },
            });
            if (changed.count)
                await tx.auditLog.create({
                    data: {
                        userId: user.id,
                        action: 'SESSION_REVOKED',
                        metadata: { sessionId: payload.sid, reason: 'LOGOUT' },
                    },
                });
        });
    }
    async sessions(userId, currentSessionId) {
        const rows = await this.prisma.authSession.findMany({
            where: { userId, revokedAt: null, expiresAt: { gt: new Date() } },
            orderBy: { createdAt: 'desc' },
            select: { id: true, userAgent: true, createdAt: true, lastUsedAt: true, expiresAt: true },
        });
        return rows.map((row) => ({ ...row, current: row.id === currentSessionId }));
    }
    async revokeSession(userId, sessionId) {
        return this.prisma.$transaction(async (tx) => {
            await tx.$queryRaw `SELECT id FROM users WHERE id=${userId} FOR UPDATE`;
            const session = await tx.authSession.findUnique({ where: { id: sessionId } });
            if (!session || session.userId !== userId)
                throw new common_1.NotFoundException('Session not found');
            if (!session.revokedAt) {
                await tx.authSession.update({
                    where: { id: sessionId },
                    data: { revokedAt: new Date(), revokeReason: 'USER_REVOKED' },
                });
                await tx.auditLog.create({
                    data: {
                        userId,
                        action: 'SESSION_REVOKED',
                        metadata: { sessionId, reason: 'USER_REVOKED' },
                    },
                });
            }
            return { message: 'Session logged out' };
        });
    }
    async logoutAll(userId) {
        return this.prisma.$transaction(async (tx) => {
            await tx.$queryRaw `SELECT id FROM users WHERE id=${userId} FOR UPDATE`;
            await tx.authSession.updateMany({
                where: { userId, revokedAt: null },
                data: { revokedAt: new Date(), revokeReason: 'LOGOUT_ALL' },
            });
            await tx.authToken.updateMany({ where: { userId }, data: { isRevoked: true } });
            await tx.user.update({ where: { id: userId }, data: { authVersion: { increment: 1 } } });
            await tx.auditLog.create({ data: { userId, action: 'ALL_SESSIONS_REVOKED' } });
            return { message: 'All devices logged out. Log in again.' };
        });
    }
};
exports.AuthService = AuthService;
exports.AuthService = AuthService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [users_service_1.UsersService,
        jwt_1.JwtService,
        config_1.ConfigService,
        prisma_service_1.PrismaService])
], AuthService);
//# sourceMappingURL=auth.service.js.map