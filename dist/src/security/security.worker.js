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
var SecurityWorker_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.SecurityWorker = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const prisma_service_1 = require("../prisma/prisma.service");
const delivery_service_1 = require("./delivery.service");
let SecurityWorker = SecurityWorker_1 = class SecurityWorker {
    prisma;
    config;
    delivery;
    timer;
    running = false;
    logger = new common_1.Logger(SecurityWorker_1.name);
    constructor(prisma, config, delivery) {
        this.prisma = prisma;
        this.config = config;
        this.delivery = delivery;
    }
    onModuleInit() {
        if (this.config.get('AUTH_DELIVERY_MODE') === 'provider') {
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
            await this.prisma.securityDelivery.updateMany({
                where: { expiresAt: { lt: new Date() }, payload: { not: null } },
                data: { payload: null, status: 'EXPIRED' },
            });
            const now = new Date();
            const due = await this.prisma.securityDelivery.findMany({
                where: {
                    status: 'PENDING',
                    nextAttemptAt: { lte: now },
                    OR: [{ lockedUntil: null }, { lockedUntil: { lt: now } }],
                },
                orderBy: { nextAttemptAt: 'asc' },
                take: 10,
            });
            for (const message of due)
                await this.delivery.process(message.id);
        }
        catch {
            this.logger.error('Authentication delivery worker unavailable; will retry');
        }
        finally {
            this.running = false;
        }
    }
};
exports.SecurityWorker = SecurityWorker;
exports.SecurityWorker = SecurityWorker = SecurityWorker_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        config_1.ConfigService,
        delivery_service_1.SecurityDeliveryService])
], SecurityWorker);
//# sourceMappingURL=security.worker.js.map