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
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.WebhookService = void 0;
const node_crypto_1 = require("node:crypto");
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../prisma/prisma.service");
const paystack_service_1 = require("../paystack/paystack.service");
const payment_1 = require("../paystack/payment");
const confirmation_service_1 = require("./confirmation.service");
const transfer_1 = require("../paystack/transfer");
const payouts_service_1 = require("../payouts/payouts.service");
let WebhookService = class WebhookService {
    prisma;
    paystack;
    confirmation;
    payouts;
    constructor(prisma, paystack, confirmation, payouts) {
        this.prisma = prisma;
        this.paystack = paystack;
        this.confirmation = confirmation;
        this.payouts = payouts;
    }
    async receive(raw, signature) {
        if (!this.paystack.authenticateWebhook(raw, signature))
            throw new common_1.UnauthorizedException('Invalid Paystack signature');
        if (!raw)
            throw new common_1.BadRequestException('Raw webhook body required');
        let body;
        try {
            body = (0, payment_1.record)(JSON.parse(raw.toString('utf8')));
        }
        catch {
            throw new common_1.BadRequestException('Invalid webhook payload');
        }
        if (typeof body.event !== 'string')
            throw new common_1.BadRequestException('Webhook event type required');
        const id = (0, node_crypto_1.createHash)('sha256').update(raw).digest('hex');
        let payment;
        if (body.event === 'charge.success')
            payment = (0, payment_1.parsePayment)(body.data);
        if (['transfer.success', 'transfer.failed', 'transfer.reversed'].includes(body.event)) {
            try {
                payment = (0, transfer_1.parseTransferNotice)(body.data);
            }
            catch {
                throw new common_1.BadRequestException('Invalid transfer webhook');
            }
        }
        await this.prisma.paystackEvent.createMany({
            skipDuplicates: true,
            data: [
                {
                    id,
                    eventType: body.event,
                    reference: payment?.reference,
                    payment: payment ? { ...payment } : {},
                    status: payment ? 'RECEIVED' : 'IGNORED',
                    processedAt: payment ? null : new Date(),
                },
            ],
        });
        return { received: true };
    }
    async process(id) {
        const now = new Date();
        const claimed = await this.prisma.paystackEvent.updateMany({
            where: {
                id,
                status: 'RECEIVED',
                nextAttemptAt: { lte: now },
                OR: [{ lockedUntil: null }, { lockedUntil: { lt: now } }],
            },
            data: { lockedUntil: new Date(now.getTime() + 60_000), attempts: { increment: 1 } },
        });
        if (!claimed.count)
            return;
        const event = await this.prisma.paystackEvent.findUniqueOrThrow({ where: { id } });
        try {
            if (event.eventType.startsWith('transfer.')) {
                if (!this.payouts)
                    throw new Error('Payout processing unavailable');
                const payout = await this.payouts.verify(event.reference ?? '', undefined, event.payment);
                if (!['SUCCESS', 'FAILED', 'REVERSED'].includes(payout.status))
                    throw new Error('Transfer outcome pending');
            }
            else {
                const payment = event.payment;
                const request = await this.confirmation.confirm(event.reference ?? '', undefined, payment);
                if (request.status !== 'SUCCESS')
                    throw new Error('Payment not yet successful');
            }
            await this.prisma.paystackEvent.update({
                where: { id },
                data: { status: 'PROCESSED', processedAt: new Date(), lockedUntil: null, lastError: null },
            });
        }
        catch (error) {
            const rejected = error instanceof common_1.ConflictException || error instanceof common_1.NotFoundException;
            await this.prisma.paystackEvent.update({
                where: { id },
                data: {
                    status: rejected ? 'REJECTED' : 'RECEIVED',
                    lockedUntil: null,
                    processedAt: rejected ? new Date() : null,
                    lastError: rejected
                        ? 'Payment mismatch, unknown funding request, or wallet requires reconciliation'
                        : 'Verification temporarily unavailable; retry scheduled',
                    nextAttemptAt: new Date(Date.now() + Math.min(3600_000, 30_000 * 2 ** Math.min(event.attempts, 7))),
                },
            });
        }
    }
};
exports.WebhookService = WebhookService;
exports.WebhookService = WebhookService = __decorate([
    (0, common_1.Injectable)(),
    __param(3, (0, common_1.Optional)()),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        paystack_service_1.PaystackService,
        confirmation_service_1.ConfirmationService,
        payouts_service_1.PayoutsService])
], WebhookService);
//# sourceMappingURL=webhook.service.js.map