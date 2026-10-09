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
exports.FinancialService = void 0;
const common_1 = require("@nestjs/common");
const client_1 = require("@prisma/client");
const prisma_service_1 = require("../prisma/prisma.service");
const operations_provider_service_1 = require("../paystack/operations-provider.service");
const confirmation_service_1 = require("../funding/confirmation.service");
let FinancialService = class FinancialService {
    prisma;
    provider;
    constructor(prisma, provider) {
        this.prisma = prisma;
        this.provider = provider;
    }
    async issue(key, kind, reference, details) {
        const id = key;
        await this.prisma
            .$executeRaw `INSERT INTO reconciliation_issues(id,key,kind,reference,details) VALUES(${id},${key},${kind},${reference},${JSON.stringify(details)}::jsonb) ON CONFLICT(key) DO UPDATE SET details=EXCLUDED.details,status=CASE WHEN reconciliation_issues.details IS DISTINCT FROM EXCLUDED.details THEN 'OPEN' ELSE reconciliation_issues.status END,"lastSeenAt"=now(),"resolvedAt"=CASE WHEN reconciliation_issues.details IS DISTINCT FROM EXCLUDED.details THEN NULL ELSE reconciliation_issues."resolvedAt" END,resolution=CASE WHEN reconciliation_issues.details IS DISTINCT FROM EXCLUDED.details THEN NULL ELSE reconciliation_issues.resolution END`;
    }
    async journal(tx, id, debit, credit, amount, description) {
        if (amount === 0n)
            return;
        await tx.ledgerJournal.create({ data: { id, reference: id, currency: 'NGN', description } });
        await tx.ledgerEntry.createMany({
            data: [
                { id: `${id}:debit`, journalId: id, accountId: debit, side: 'DEBIT', amountMinor: amount },
                {
                    id: `${id}:credit`,
                    journalId: id,
                    accountId: credit,
                    side: 'CREDIT',
                    amountMinor: amount,
                },
            ],
        });
    }
    async fee(kind, reference, amountMinor) {
        if (amountMinor === undefined) {
            await this.issue(`fee-missing:${kind}:${reference}`, 'FEE_UNKNOWN', reference, {
                message: 'Provider did not report a verifiable fee',
            });
            return;
        }
        if (!/^\d+$/.test(amountMinor) || BigInt(amountMinor) > BigInt(Number.MAX_SAFE_INTEGER))
            throw new common_1.ConflictException('Invalid fee');
        const amount = BigInt(amountMinor);
        const id = `${kind}:${reference}`;
        const changed = await this.prisma.$transaction(async (tx) => {
            await tx.$queryRaw `SELECT pg_advisory_xact_lock(hashtextextended(${`fee:${id}`},0))::text`;
            const previous = await tx.providerFee.findUnique({ where: { id } });
            if (previous)
                return previous.amountMinor !== amount;
            await tx.providerFee.create({ data: { id, kind, reference, amountMinor: amount } });
            await this.journal(tx, `fee:${id}`, 'system:NGN:FEES', 'system:NGN:CLEARING', amount, 'Business-borne Paystack fee');
            return false;
        });
        if (changed)
            await this.issue(`fee-changed:${id}`, 'FEE_CHANGED', reference, {
                reportedMinor: amountMinor,
                message: 'Previously posted provider fee differs; append a reviewed adjustment',
            });
    }
    async processCase(kind, providerId) {
        const verified = await this.provider.fetchCase(kind, providerId);
        const funding = await this.prisma.fundingRequest.findUnique({
            where: { reference: verified.transaction.reference },
        });
        if (!funding) {
            await this.issue(`unknown-case:${kind}:${providerId}`, 'UNKNOWN_PROVIDER_CASE', verified.transaction.reference, { kind, providerId });
            throw new common_1.NotFoundException('Funding request not found for financial case');
        }
        if (funding.status !== 'SUCCESS' || !(0, confirmation_service_1.matchesPayment)(funding, verified.transaction))
            throw new common_1.ConflictException('Financial case does not match credited funding');
        const settles = (kind === 'REFUND' && verified.status === 'processed') ||
            (kind === 'DISPUTE' &&
                verified.status === 'resolved' &&
                verified.resolution === 'merchant-accepted' &&
                verified.amountMinor > 0n);
        const needsReview = kind === 'DISPUTE' && verified.status === 'resolved' && verified.resolution !== 'declined';
        const accountingKind = kind === 'REFUND' && verified.disputeId ? 'DISPUTE' : kind;
        const accountingId = kind === 'REFUND' && verified.disputeId ? verified.disputeId : providerId;
        const result = await this.prisma.$transaction(async (tx) => {
            await tx.$queryRaw `SELECT id FROM funding_requests WHERE id=${funding.id} FOR UPDATE`;
            await tx.$queryRaw `SELECT id FROM wallets WHERE id=${funding.walletId} FOR UPDATE`;
            const wallet = await tx.wallet.findUniqueOrThrow({ where: { id: funding.walletId } });
            let financialCase = await tx.financialCase.findUnique({
                where: { kind_providerId: { kind: accountingKind, providerId: accountingId } },
            });
            if (financialCase?.applied) {
                if (financialCase.amountMinor !== verified.amountMinor || !settles)
                    throw new common_1.ConflictException('Previously applied financial outcome changed');
                return financialCase;
            }
            const data = {
                fundingId: funding.id,
                reference: funding.reference,
                walletId: wallet.id,
                providerStatus: verified.status,
                amountMinor: verified.amountMinor,
                nextCheckAt: new Date(Date.now() + 3600_000),
            };
            financialCase = financialCase
                ? await tx.financialCase.update({ where: { id: financialCase.id }, data })
                : await tx.financialCase.create({
                    data: { kind: accountingKind, providerId: accountingId, ...data },
                });
            if ((kind === 'DISPUTE' &&
                verified.status !== 'resolved' &&
                verified.status !== 'archived') ||
                needsReview) {
                await tx.wallet.update({ where: { id: wallet.id }, data: { outgoingFrozen: true } });
            }
            if (!settles)
                return financialCase;
            if (verified.amountMinor <= 0n || wallet.closedAt)
                throw new common_1.ConflictException('Refund requires reconciliation');
            const total = await tx.financialCase.aggregate({
                where: { fundingId: funding.id, applied: true },
                _sum: { amountMinor: true },
            });
            if ((total._sum.amountMinor ?? 0n) + verified.amountMinor > funding.amountMinor)
                throw new common_1.ConflictException('Cumulative recoveries exceed the funding amount; investigate overlap');
            const available = wallet.balanceMinor - wallet.reservedMinor;
            const recovered = available < verified.amountMinor ? available : verified.amountMinor;
            const shortfall = verified.amountMinor - recovered;
            const applied = await tx.financialCase.update({
                where: { id: financialCase.id },
                data: { applied: true, recoveredMinor: recovered, shortfallMinor: shortfall },
            });
            if (recovered > 0n) {
                await tx.transaction.create({
                    data: {
                        id: `case:${applied.id}`,
                        referenceId: `case:${applied.id}`,
                        amountMinor: recovered,
                        currency: 'NGN',
                        type: 'DEBIT',
                        status: 'SUCCESS',
                        senderWalletId: wallet.id,
                        metadata: { financialCaseId: applied.id, providerKind: kind, providerId },
                    },
                });
                await tx.wallet.update({
                    where: { id: wallet.id },
                    data: { balanceMinor: { decrement: recovered } },
                });
            }
            await this.journal(tx, `case-shortfall:${applied.id}`, 'system:NGN:ADJUSTMENTS', 'system:NGN:CLEARING', shortfall, 'Unrecovered refund principal requiring investigation');
            if (shortfall > 0n)
                await tx.wallet.update({ where: { id: wallet.id }, data: { outgoingFrozen: true } });
            return applied;
        }, { isolationLevel: client_1.Prisma.TransactionIsolationLevel.ReadCommitted });
        if (result.shortfallMinor > 0n)
            await this.issue(`case-shortfall:${result.id}`, 'RECOVERY_SHORTFALL', funding.reference, {
                caseId: result.id,
                walletId: result.walletId,
                shortfallMinor: result.shortfallMinor.toString(),
            });
        if (kind === 'DISPUTE')
            await this.issue(`dispute:${providerId}`, needsReview ? 'CHARGEBACK_REVIEW' : 'DISPUTE_REVIEW', funding.reference, {
                caseId: result.id,
                providerStatus: verified.status,
                resolution: verified.resolution,
                message: 'Review dispute outcome and its linked refund; no second automatic chargeback debit',
            });
        return {
            ...result,
            amountMinor: result.amountMinor.toString(),
            recoveredMinor: result.recoveredMinor.toString(),
            shortfallMinor: result.shortfallMinor.toString(),
        };
    }
};
exports.FinancialService = FinancialService;
exports.FinancialService = FinancialService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        operations_provider_service_1.OperationsProviderService])
], FinancialService);
//# sourceMappingURL=financial.service.js.map