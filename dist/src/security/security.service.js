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
exports.SecurityService = void 0;
const node_crypto_1 = require("node:crypto");
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const bcrypt = __importStar(require("bcrypt"));
const prisma_service_1 = require("../prisma/prisma.service");
const actions_1 = require("./actions");
const crypto_1 = require("./crypto");
const delivery_service_1 = require("./delivery.service");
let SecurityService = class SecurityService {
    prisma;
    config;
    delivery;
    constructor(prisma, config, delivery) {
        this.prisma = prisma;
        this.config = config;
        this.delivery = delivery;
    }
    secret() {
        return this.config.getOrThrow('AUTH_SECURITY_SECRET');
    }
    async user(id) {
        const user = await this.prisma.user.findUnique({ where: { id } });
        if (!user || !user.isActive || user.closedAt)
            throw new common_1.UnauthorizedException('Active account required');
        return user;
    }
    hash(id, code) {
        return (0, crypto_1.secretHash)(this.secret(), `code:${id}:${code}`);
    }
    async issue(user, purpose, target, channel, summary, action, binding) {
        this.delivery.assertAvailable(channel);
        return this.prisma.$transaction(async (tx) => {
            await tx.$queryRaw `SELECT id FROM users WHERE id=${user.id} FOR UPDATE`;
            const current = await tx.user.findUniqueOrThrow({ where: { id: user.id } });
            if (!current.isActive ||
                current.closedAt ||
                current.authVersion !== user.authVersion ||
                current.password !== user.password)
                throw new common_1.UnauthorizedException('Account state changed');
            const recent = await tx.securityChallenge.findFirst({
                where: { userId: user.id, purpose },
                orderBy: { createdAt: 'desc' },
            });
            if (recent && recent.createdAt.getTime() > Date.now() - 60_000)
                throw new common_1.ConflictException('Wait at least 60 seconds before requesting another code');
            if ((await tx.securityChallenge.count({
                where: { userId: user.id, createdAt: { gte: new Date(Date.now() - 3600_000) } },
            })) >= 10)
                throw new common_1.ConflictException('Security code request limit reached');
            await tx.securityChallenge.updateMany({
                where: { userId: user.id, purpose, consumedAt: null },
                data: { consumedAt: new Date() },
            });
            const id = (0, node_crypto_1.randomUUID)();
            const code = (0, node_crypto_1.randomInt)(0, 1_000_000).toString().padStart(6, '0');
            const expiresAt = new Date(Date.now() + 600_000);
            await tx.securityChallenge.create({
                data: {
                    id,
                    userId: user.id,
                    purpose,
                    target,
                    codeHash: this.hash(id, code),
                    authVersion: current.authVersion,
                    action,
                    binding,
                    expiresAt,
                },
            });
            await tx.securityDelivery.create({
                data: {
                    id,
                    channel,
                    recipient: target,
                    payload: (0, crypto_1.encryptDelivery)(this.secret(), { code, summary, challengeId: id }),
                    status: this.config.get('AUTH_DELIVERY_MODE') === 'test' ? 'TEST' : 'PENDING',
                    expiresAt,
                },
            });
            await tx.auditLog.create({
                data: {
                    userId: user.id,
                    action: `SECURITY_${purpose}_REQUESTED`,
                    metadata: { challengeId: id, ...(action ? { securityAction: action } : {}) },
                },
            });
            return { challengeId: id, expiresAt };
        });
    }
    async status(userId) {
        const user = await this.user(userId);
        return {
            emailVerified: Boolean(user.emailVerifiedAt),
            emailVerifiedAt: user.emailVerifiedAt,
        };
    }
    async requestEmail(userId) {
        const user = await this.user(userId);
        return this.issue(user, 'EMAIL', user.email, 'EMAIL', 'Verify your email address');
    }
    async requestReset(email) {
        const started = Date.now();
        try {
            const user = await this.prisma.user.findUnique({ where: { email } });
            if (user?.isActive && !user.closedAt)
                await this.issue(user, 'RESET', user.email, 'EMAIL', 'Reset your password');
        }
        catch {
        }
        await new Promise((resolve) => setTimeout(resolve, Math.max(0, 250 - (Date.now() - started))));
        return { message: 'If the account is eligible, a password reset code will be delivered.' };
    }
    async requestStepUp(userId, password, action, details) {
        const user = await this.user(userId);
        if (!user.emailVerifiedAt)
            throw new common_1.ForbiddenException('Verify your email before sensitive actions');
        if (action === 'ADMIN' && user.role !== 'ADMIN')
            throw new common_1.ForbiddenException('Administrator required');
        if (typeof password !== 'string' || !(await bcrypt.compare(password, user.password)))
            throw new common_1.UnauthorizedException('Invalid credentials');
        const descriptor = (0, actions_1.describeAction)(action, details);
        return this.issue(user, 'STEP_UP', user.email, 'EMAIL', descriptor.summary, action, descriptor.binding);
    }
    async consume(purpose, id, code, userId, perform) {
        if (typeof id !== 'string' || typeof code !== 'string' || !/^\d{6}$/.test(code))
            throw new common_1.UnauthorizedException('Invalid or expired security code');
        const result = await this.prisma.$transaction(async (tx) => {
            const before = await tx.securityChallenge.findUnique({ where: { id } });
            if (!before || before.purpose !== purpose || (userId && before.userId !== userId))
                return { valid: false };
            await tx.$queryRaw `SELECT id FROM users WHERE id=${before.userId} FOR UPDATE`;
            await tx.$queryRaw `SELECT id FROM security_challenges WHERE id=${id} FOR UPDATE`;
            const challenge = await tx.securityChallenge.findUniqueOrThrow({ where: { id } });
            const user = await tx.user.findUniqueOrThrow({ where: { id: before.userId } });
            if (challenge.consumedAt ||
                challenge.expiresAt <= new Date() ||
                challenge.attempts >= 5 ||
                !user.isActive ||
                user.closedAt ||
                challenge.authVersion !== user.authVersion ||
                (purpose !== 'PHONE' && challenge.target !== user.email))
                return { valid: false };
            const expected = Buffer.from(challenge.codeHash, 'hex');
            const supplied = Buffer.from(this.hash(id, code), 'hex');
            if (expected.length !== supplied.length || !(0, node_crypto_1.timingSafeEqual)(expected, supplied)) {
                await tx.securityChallenge.update({
                    where: { id },
                    data: {
                        attempts: { increment: 1 },
                        ...(challenge.attempts >= 4 ? { consumedAt: new Date() } : {}),
                    },
                });
                await tx.auditLog.create({
                    data: {
                        userId: user.id,
                        action: 'SECURITY_CODE_REJECTED',
                        metadata: { challengeId: id, purpose },
                    },
                });
                return { valid: false };
            }
            await tx.securityChallenge.update({ where: { id }, data: { consumedAt: new Date() } });
            await tx.securityDelivery.updateMany({
                where: { id },
                data: { payload: null, status: 'EXPIRED' },
            });
            const value = await perform(tx, user, challenge);
            await tx.auditLog.create({
                data: {
                    userId: user.id,
                    action: `SECURITY_${purpose}_CONFIRMED`,
                    metadata: { challengeId: id },
                },
            });
            return { valid: true, value };
        });
        if (!result.valid)
            throw new common_1.UnauthorizedException('Invalid or expired security code');
        return result.value;
    }
    confirmEmail(userId, id, code) {
        return this.consume('EMAIL', id, code, userId, async (tx, user) => {
            await tx.user.update({ where: { id: user.id }, data: { emailVerifiedAt: new Date() } });
            return { emailVerified: true };
        });
    }
    async resetPassword(id, code, password) {
        if (typeof password !== 'string' ||
            password.length < 12 ||
            Buffer.byteLength(password, 'utf8') > 72)
            throw new common_1.BadRequestException('New password must have at least 12 characters and at most 72 UTF-8 bytes');
        return this.consume('RESET', id, code, undefined, async (tx, user) => {
            const hash = await bcrypt.hash(password, 12);
            await tx.user.update({
                where: { id: user.id },
                data: { password: hash, authVersion: { increment: 1 } },
            });
            await tx.authToken.updateMany({ where: { userId: user.id }, data: { isRevoked: true } });
            await tx.authSession.updateMany({
                where: { userId: user.id, revokedAt: null },
                data: { revokedAt: new Date(), revokeReason: 'PASSWORD_RESET' },
            });
            await tx.securityChallenge.updateMany({
                where: { userId: user.id, consumedAt: null },
                data: { consumedAt: new Date() },
            });
            await tx.stepUpProof.updateMany({
                where: { userId: user.id, consumedAt: null },
                data: { consumedAt: new Date() },
            });
            return { message: 'Password reset. Log in again; previous sessions are invalid.' };
        });
    }
    confirmStepUp(userId, id, code) {
        return this.consume('STEP_UP', id, code, userId, async (tx, user, challenge) => {
            if (!user.emailVerifiedAt || !challenge.action || !challenge.binding)
                throw new common_1.ForbiddenException('Verified email and action required');
            const token = (0, node_crypto_1.randomBytes)(32).toString('hex');
            const expiresAt = new Date(Date.now() + 300_000);
            await tx.stepUpProof.create({
                data: {
                    userId: user.id,
                    tokenHash: (0, crypto_1.secretHash)(this.secret(), `proof:${token}`),
                    action: challenge.action,
                    binding: challenge.binding,
                    authVersion: user.authVersion,
                    expiresAt,
                },
            });
            return { stepUpToken: token, expiresAt, action: challenge.action };
        });
    }
    async authorize(userId, token, action, details) {
        if (typeof token !== 'string' || !/^[a-f0-9]{64}$/.test(token))
            throw new common_1.ForbiddenException('A fresh x-step-up-token is required');
        const binding = (0, actions_1.describeAction)(action, details).binding;
        const tokenHash = (0, crypto_1.secretHash)(this.secret(), `proof:${token}`);
        const valid = await this.prisma.$transaction(async (tx) => {
            await tx.$queryRaw `SELECT id FROM users WHERE id=${userId} FOR UPDATE`;
            const user = await tx.user.findUnique({ where: { id: userId } });
            if (!user?.isActive ||
                user.closedAt ||
                !user.emailVerifiedAt ||
                (action === 'ADMIN' && user.role !== 'ADMIN'))
                return false;
            const consumed = await tx.stepUpProof.updateMany({
                where: {
                    userId,
                    tokenHash,
                    action,
                    binding,
                    authVersion: user.authVersion,
                    consumedAt: null,
                    expiresAt: { gt: new Date() },
                },
                data: { consumedAt: new Date() },
            });
            if (!consumed.count)
                return false;
            await tx.auditLog.create({
                data: { userId, action: 'STEP_UP_USED', metadata: { securityAction: action, binding } },
            });
            return user.authVersion;
        });
        if (valid === false)
            throw new common_1.ForbiddenException('Step-up proof is expired, used, or does not match this action');
        return valid;
    }
};
exports.SecurityService = SecurityService;
exports.SecurityService = SecurityService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        config_1.ConfigService,
        delivery_service_1.SecurityDeliveryService])
], SecurityService);
//# sourceMappingURL=security.service.js.map