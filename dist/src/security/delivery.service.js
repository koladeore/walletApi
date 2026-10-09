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
Object.defineProperty(exports, "__esModule", { value: true });
exports.SecurityDeliveryService = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const prisma_service_1 = require("../prisma/prisma.service");
const crypto_1 = require("./crypto");
let SecurityDeliveryService = class SecurityDeliveryService {
    config;
    prisma;
    constructor(config, prisma) {
        this.config = config;
        this.prisma = prisma;
    }
    assertAvailable(channel) {
        const mode = this.config.get('AUTH_DELIVERY_MODE');
        if (mode === 'test' &&
            ['development', 'test'].includes(this.config.get('NODE_ENV') ?? ''))
            return;
        if (mode !== 'provider' ||
            channel !== 'EMAIL' ||
            !this.config.get('RESEND_API_KEY') ||
            !this.config.get('AUTH_EMAIL_FROM'))
            throw new common_1.ServiceUnavailableException('Authentication delivery is not configured');
    }
    async process(id) {
        const now = new Date();
        const claim = await this.prisma.securityDelivery.updateMany({
            where: {
                id,
                status: 'PENDING',
                nextAttemptAt: { lte: now },
                OR: [{ lockedUntil: null }, { lockedUntil: { lt: now } }],
            },
            data: { lockedUntil: new Date(Date.now() + 60_000), attempts: { increment: 1 } },
        });
        if (!claim.count)
            return;
        const message = await this.prisma.securityDelivery.findUniqueOrThrow({ where: { id } });
        const challenge = await this.prisma.securityChallenge.findUnique({ where: { id } });
        const user = challenge
            ? await this.prisma.user.findUnique({ where: { id: challenge.userId } })
            : null;
        if (!message.payload ||
            message.expiresAt <= now ||
            !challenge ||
            challenge.consumedAt ||
            !user?.isActive ||
            user.closedAt ||
            user.authVersion !== challenge.authVersion) {
            await this.prisma.securityDelivery.update({
                where: { id },
                data: { status: 'EXPIRED', payload: null, lockedUntil: null },
            });
            return;
        }
        try {
            this.assertAvailable(message.channel);
            if (this.config.get('AUTH_DELIVERY_MODE') !== 'provider')
                throw new Error('Provider delivery disabled');
            const payload = (0, crypto_1.decryptDelivery)(this.config.getOrThrow('AUTH_SECURITY_SECRET'), message.payload);
            if (!payload ||
                !/^\d{6}$/.test(payload.code) ||
                payload.challengeId !== id ||
                typeof payload.summary !== 'string')
                throw new Error('Invalid delivery');
            const text = `Wallet security: ${payload.summary}\nCode: ${payload.code}\nChallenge ID: ${id}\nThis code expires in 10 minutes. If you did not request it, do not share it.`;
            const response = await fetch('https://api.resend.com/emails', {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${this.config.getOrThrow('RESEND_API_KEY')}`,
                    'Content-Type': 'application/json',
                    'Idempotency-Key': `security-${id}`,
                },
                body: JSON.stringify({
                    from: this.config.getOrThrow('AUTH_EMAIL_FROM'),
                    to: [message.recipient],
                    subject: 'Wallet security code',
                    text,
                }),
                signal: AbortSignal.timeout(10_000),
                redirect: 'error',
            });
            if (!response.ok)
                throw new Error('Delivery rejected');
            await this.prisma.securityDelivery.update({
                where: { id },
                data: { status: 'SENT', payload: null, lockedUntil: null },
            });
        }
        catch {
            await this.prisma.securityDelivery.update({
                where: { id },
                data: {
                    status: message.attempts >= 5 ? 'FAILED' : 'PENDING',
                    ...(message.attempts >= 5 ? { payload: null } : {}),
                    nextAttemptAt: new Date(Date.now() + 30_000 * 2 ** Math.min(message.attempts, 5)),
                    lockedUntil: null,
                },
            });
        }
    }
};
exports.SecurityDeliveryService = SecurityDeliveryService;
exports.SecurityDeliveryService = SecurityDeliveryService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [config_1.ConfigService,
        prisma_service_1.PrismaService])
], SecurityDeliveryService);
//# sourceMappingURL=delivery.service.js.map