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
var PayoutsWorker_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.PayoutsWorker = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const prisma_service_1 = require("../prisma/prisma.service");
const payouts_service_1 = require("./payouts.service");
let PayoutsWorker = PayoutsWorker_1 = class PayoutsWorker {
    prisma;
    config;
    payouts;
    timer;
    running = false;
    logger = new common_1.Logger(PayoutsWorker_1.name);
    constructor(prisma, config, payouts) {
        this.prisma = prisma;
        this.config = config;
        this.payouts = payouts;
    }
    onModuleInit() {
        if (this.config.get('PAYSTACK_ENABLED') === 'true') {
            this.timer = setInterval(() => {
                void this.tick();
            }, 30_000);
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
            const now = new Date();
            const due = await this.prisma.payout.findMany({
                where: {
                    status: { in: ['PENDING', 'PROCESSING', 'SUCCESS'] },
                    nextCheckAt: { lte: now },
                    OR: [{ lockedUntil: null }, { lockedUntil: { lt: now } }],
                },
                orderBy: { nextCheckAt: 'asc' },
                take: 10,
            });
            for (const payout of due) {
                try {
                    if (!payout.submittedAt)
                        await this.payouts.dispatch(payout.reference);
                    else {
                        const claim = await this.prisma.payout.updateMany({
                            where: { id: payout.id, nextCheckAt: { lte: now } },
                            data: {
                                nextCheckAt: new Date(Date.now() + (payout.status === 'SUCCESS' ? 3600_000 : 60_000)),
                            },
                        });
                        if (claim.count)
                            await this.payouts.verify(payout.reference);
                    }
                }
                catch {
                    this.logger.warn('Payout requires later verification or reconciliation');
                }
            }
        }
        catch {
            this.logger.error('Payout background check failed; will retry');
        }
        finally {
            this.running = false;
        }
    }
};
exports.PayoutsWorker = PayoutsWorker;
exports.PayoutsWorker = PayoutsWorker = PayoutsWorker_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        config_1.ConfigService,
        payouts_service_1.PayoutsService])
], PayoutsWorker);
//# sourceMappingURL=payouts.worker.js.map