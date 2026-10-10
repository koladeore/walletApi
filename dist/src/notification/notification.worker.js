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
var NotificationWorker_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.NotificationWorker = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const prisma_service_1 = require("../prisma/prisma.service");
let NotificationWorker = NotificationWorker_1 = class NotificationWorker {
    prisma;
    config;
    timer;
    running = false;
    logger = new common_1.Logger(NotificationWorker_1.name);
    constructor(prisma, config) {
        this.prisma = prisma;
        this.config = config;
    }
    onModuleInit() {
        if (this.config.get('AUTH_DELIVERY_MODE') === 'provider' &&
            this.config.get('NOTIFICATION_EMAIL_ENABLED') !== 'false') {
            this.timer = setInterval(() => {
                void this.tick();
            }, 5000);
            this.timer.unref();
        }
    }
    onModuleDestroy() {
        if (this.timer)
            clearInterval(this.timer);
    }
    async tick() {
        if (this.running)
            return;
        this.running = true;
        try {
            const due = await this.prisma.notification.findMany({
                where: {
                    emailStatus: 'PENDING',
                    emailNextAttemptAt: { lte: new Date() },
                    OR: [{ emailLockedUntil: null }, { emailLockedUntil: { lt: new Date() } }],
                },
                select: { id: true },
                orderBy: { createdAt: 'asc' },
                take: 10,
            });
            for (const row of due)
                await this.deliver(row.id);
        }
        catch {
            this.logger.error('Notification delivery unavailable; will retry');
        }
        finally {
            this.running = false;
        }
    }
    async deliver(id) {
        if (this.config.get('AUTH_DELIVERY_MODE') !== 'provider' ||
            this.config.get('NOTIFICATION_EMAIL_ENABLED') === 'false')
            return;
        const now = new Date();
        const claimed = await this.prisma.notification.updateMany({
            where: {
                id,
                emailStatus: 'PENDING',
                emailNextAttemptAt: { lte: now },
                OR: [{ emailLockedUntil: null }, { emailLockedUntil: { lt: now } }],
            },
            data: { emailLockedUntil: new Date(Date.now() + 60000), emailAttempts: { increment: 1 } },
        });
        if (!claimed.count)
            return;
        const row = await this.prisma.notification.findUniqueOrThrow({
            where: { id },
            include: { user: true },
        });
        if (row.emailAttempts > 5) {
            await this.prisma.notification.update({
                where: { id },
                data: { emailStatus: 'FAILED', emailLockedUntil: null },
            });
            return;
        }
        if (row.createdAt.getTime() < Date.now() - 3600000 ||
            !row.user.emailVerifiedAt ||
            !row.user.isActive ||
            row.user.closedAt ||
            (row.emailRecipient && row.emailRecipient !== row.user.email)) {
            await this.prisma.notification.update({
                where: { id },
                data: { emailStatus: 'SKIPPED', emailLockedUntil: null },
            });
            return;
        }
        try {
            const recipient = row.emailRecipient ?? row.user.email;
            if (!row.emailRecipient)
                await this.prisma.notification.update({
                    where: { id },
                    data: { emailRecipient: recipient },
                });
            const response = await fetch('https://api.resend.com/emails', {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${this.config.getOrThrow('RESEND_API_KEY')}`,
                    'Content-Type': 'application/json',
                    'Idempotency-Key': `notification-${id}`,
                },
                body: JSON.stringify({
                    from: this.config.getOrThrow('AUTH_EMAIL_FROM'),
                    to: [recipient],
                    subject: row.title,
                    text: `${row.body}\n\nOpen your wallet app to view the details.\nNotification ID: ${id}`,
                }),
                signal: AbortSignal.timeout(10000),
                redirect: 'error',
            });
            if (!response.ok) {
                const permanent = response.status >= 400 && response.status < 500 && ![408, 429].includes(response.status);
                if (permanent) {
                    await this.prisma.notification.update({
                        where: { id },
                        data: { emailStatus: 'FAILED', emailLockedUntil: null },
                    });
                    return;
                }
                throw new Error('Delivery unavailable');
            }
            await this.prisma.notification.update({
                where: { id },
                data: { emailStatus: 'SENT', emailLockedUntil: null },
            });
        }
        catch {
            await this.prisma.notification.update({
                where: { id },
                data: {
                    emailStatus: row.emailAttempts >= 5 ? 'FAILED' : 'PENDING',
                    emailLockedUntil: null,
                    emailNextAttemptAt: new Date(Date.now() + 30000 * 2 ** Math.min(row.emailAttempts, 5)),
                },
            });
        }
    }
};
exports.NotificationWorker = NotificationWorker;
exports.NotificationWorker = NotificationWorker = NotificationWorker_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        config_1.ConfigService])
], NotificationWorker);
//# sourceMappingURL=notification.worker.js.map