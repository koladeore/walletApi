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
exports.BeneficiariesService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../prisma/prisma.service");
const paystack_service_1 = require("../paystack/paystack.service");
let BeneficiariesService = class BeneficiariesService {
    prisma;
    paystack;
    constructor(prisma, paystack) {
        this.prisma = prisma;
        this.paystack = paystack;
    }
    async activeUser(userId) {
        const user = await this.prisma.user.findUnique({ where: { id: userId } });
        if (!user || !user.isActive || user.closedAt)
            throw new common_1.ForbiddenException('Active user required');
    }
    validate(input) {
        if (typeof input.accountNumber !== 'string' ||
            !/^\d{10}$/.test(input.accountNumber) ||
            typeof input.bankCode !== 'string' ||
            !/^[A-Za-z0-9]{2,20}$/.test(input.bankCode))
            throw new common_1.BadRequestException('Use a ten-digit account number and a bank code as strings');
    }
    response(saved) {
        return {
            id: saved.id,
            bankCode: saved.bankCode,
            accountNumberLast4: saved.accountNumber.slice(-4),
            accountName: saved.accountName,
            currency: saved.currency,
            providerMode: saved.providerMode,
            verifiedAt: saved.verifiedAt,
            createdAt: saved.createdAt,
        };
    }
    async banks(userId, page) {
        await this.activeUser(userId);
        return this.paystack.listBanks(page);
    }
    async resolve(userId, input) {
        this.validate(input);
        await this.activeUser(userId);
        return {
            ...(await this.paystack.resolveBankAccount(input.accountNumber, input.bankCode)),
            currency: 'NGN',
            providerMode: 'test',
        };
    }
    async create(userId, input, expectedAuthVersion) {
        this.validate(input);
        await this.activeUser(userId);
        const resolved = await this.paystack.resolveBankAccount(input.accountNumber, input.bankCode);
        const saved = await this.prisma.$transaction(async (tx) => {
            await tx.$queryRaw `SELECT id FROM users WHERE id=${userId} FOR SHARE`;
            const user = await tx.user.findUnique({ where: { id: userId } });
            if (!user || !user.isActive || user.closedAt)
                throw new common_1.ForbiddenException('Active user required');
            if (expectedAuthVersion !== undefined && user.authVersion !== expectedAuthVersion)
                throw new common_1.ForbiddenException('Authentication changed; repeat step-up');
            await tx.$queryRaw `SELECT pg_advisory_xact_lock(hashtextextended(${`beneficiary:${userId}:${input.bankCode}:${input.accountNumber}`}, 0))::text`;
            return tx.beneficiary.upsert({
                where: {
                    userId_bankCode_accountNumber: {
                        userId,
                        bankCode: input.bankCode,
                        accountNumber: input.accountNumber,
                    },
                },
                create: { userId, ...resolved, verifiedAt: new Date() },
                update: { accountName: resolved.accountName, verifiedAt: new Date() },
            });
        });
        return this.response(saved);
    }
    async list(userId) {
        const rows = await this.prisma.beneficiary.findMany({
            where: { userId },
            orderBy: { createdAt: 'desc' },
        });
        return rows.map((row) => this.response(row));
    }
    async get(userId, id) {
        const row = await this.prisma.beneficiary.findFirst({ where: { userId, id } });
        if (!row)
            throw new common_1.NotFoundException('Beneficiary not found');
        return this.response(row);
    }
};
exports.BeneficiariesService = BeneficiariesService;
exports.BeneficiariesService = BeneficiariesService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        paystack_service_1.PaystackService])
], BeneficiariesService);
//# sourceMappingURL=beneficiaries.service.js.map