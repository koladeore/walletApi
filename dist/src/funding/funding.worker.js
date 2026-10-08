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
var FundingWorker_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.FundingWorker = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const prisma_service_1 = require("../prisma/prisma.service");
const webhook_service_1 = require("./webhook.service");
const confirmation_service_1 = require("./confirmation.service");
let FundingWorker = FundingWorker_1 = class FundingWorker {
    prisma;
    config;
    webhook;
    confirmation;
    timer;
    running = false;
    logger = new common_1.Logger(FundingWorker_1.name);
    constructor(prisma, config, webhook, confirmation) {
        this.prisma = prisma;
        this.config = config;
        this.webhook = webhook;
        this.confirmation = confirmation;
    }
    onModuleInit() {
        if (this.config.get('PAYSTACK_ENABLED') !== 'true')
            return;
        this.timer = setInterval(() => {
            void this.tick();
        }, 30_000);
        this.timer.unref();
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
            const now = new Date();
            const events = await this.prisma.paystackEvent.findMany({
                where: {
                    status: 'RECEIVED',
                    nextAttemptAt: { lte: now },
                    OR: [{ lockedUntil: null }, { lockedUntil: { lt: now } }],
                },
                orderBy: { nextAttemptAt: 'asc' },
                take: 10,
            });
            for (const event of events)
                await this.webhook.process(event.id);
            const cutoff = new Date(Date.now() - 60_000);
            const pending = await this.prisma.fundingRequest.findMany({
                where: {
                    status: { in: ['INITIALIZING', 'INITIALIZATION_UNKNOWN', 'PENDING'] },
                    createdAt: { lt: cutoff },
                    OR: [{ lastCheckedAt: null }, { lastCheckedAt: { lt: cutoff } }],
                },
                orderBy: [{ lastCheckedAt: { sort: 'asc', nulls: 'first' } }, { createdAt: 'asc' }],
                take: 10,
            });
            for (const request of pending) {
                const claim = await this.prisma.fundingRequest.updateMany({
                    where: {
                        id: request.id,
                        status: { not: 'SUCCESS' },
                        OR: [{ lastCheckedAt: null }, { lastCheckedAt: { lt: cutoff } }],
                    },
                    data: { lastCheckedAt: new Date() },
                });
                if (!claim.count)
                    continue;
                try {
                    await this.confirmation.confirm(request.reference);
                }
                catch {
                    this.logger.warn('Pending funding requires another verification or reconciliation');
                }
            }
        }
        catch {
            this.logger.error('Funding background check failed; will retry');
        }
        finally {
            this.running = false;
        }
    }
};
exports.FundingWorker = FundingWorker;
exports.FundingWorker = FundingWorker = FundingWorker_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        config_1.ConfigService,
        webhook_service_1.WebhookService,
        confirmation_service_1.ConfirmationService])
], FundingWorker);
//# sourceMappingURL=funding.worker.js.map