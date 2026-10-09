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
var OperationsWorker_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.OperationsWorker = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const prisma_service_1 = require("../prisma/prisma.service");
const reconciliation_service_1 = require("./reconciliation.service");
const financial_service_1 = require("./financial.service");
let OperationsWorker = OperationsWorker_1 = class OperationsWorker {
    config;
    prisma;
    reconciliation;
    financial;
    timer;
    running = false;
    logger = new common_1.Logger(OperationsWorker_1.name);
    constructor(config, prisma, reconciliation, financial) {
        this.config = config;
        this.prisma = prisma;
        this.reconciliation = reconciliation;
        this.financial = financial;
    }
    onModuleInit() {
        if (this.config.get('PAYSTACK_ENABLED') === 'true') {
            this.timer = setInterval(() => {
                void this.tick();
            }, 15 * 60_000);
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
            const cases = await this.prisma.financialCase.findMany({
                where: { applied: false, nextCheckAt: { lte: new Date() } },
                orderBy: { nextCheckAt: 'asc' },
                take: 50,
            });
            for (const item of cases)
                try {
                    await this.financial.processCase(item.kind, item.providerId);
                }
                catch {
                    this.logger.warn('Financial case needs another provider check or investigation');
                }
            await this.reconciliation.run();
        }
        catch {
            this.logger.warn('Financial reconciliation unavailable or already running');
        }
        finally {
            this.running = false;
        }
    }
};
exports.OperationsWorker = OperationsWorker;
exports.OperationsWorker = OperationsWorker = OperationsWorker_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [config_1.ConfigService,
        prisma_service_1.PrismaService,
        reconciliation_service_1.ReconciliationService,
        financial_service_1.FinancialService])
], OperationsWorker);
//# sourceMappingURL=operations.worker.js.map