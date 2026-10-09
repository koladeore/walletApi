import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { Prisma as PrismaTypes } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { OperationsProviderService } from '../paystack/operations-provider.service';
import { matchesPayment } from '../funding/confirmation.service';

@Injectable()
export class FinancialService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly provider: OperationsProviderService,
  ) {}

  async issue(
    key: string,
    kind: string,
    reference: string | null,
    details: PrismaTypes.InputJsonObject,
  ) {
    // Native conflict handling protects concurrent scans and webhook processing.
    const id = key;
    await this.prisma
      .$executeRaw`INSERT INTO reconciliation_issues(id,key,kind,reference,details) VALUES(${id},${key},${kind},${reference},${JSON.stringify(details)}::jsonb) ON CONFLICT(key) DO UPDATE SET details=EXCLUDED.details,status=CASE WHEN reconciliation_issues.details IS DISTINCT FROM EXCLUDED.details THEN 'OPEN' ELSE reconciliation_issues.status END,"lastSeenAt"=now(),"resolvedAt"=CASE WHEN reconciliation_issues.details IS DISTINCT FROM EXCLUDED.details THEN NULL ELSE reconciliation_issues."resolvedAt" END,resolution=CASE WHEN reconciliation_issues.details IS DISTINCT FROM EXCLUDED.details THEN NULL ELSE reconciliation_issues.resolution END`;
  }
  async journal(
    tx: PrismaTypes.TransactionClient,
    id: string,
    debit: string,
    credit: string,
    amount: bigint,
    description: string,
  ) {
    if (amount === 0n) return;
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
  async fee(kind: 'FUNDING' | 'PAYOUT', reference: string, amountMinor: string | undefined) {
    if (amountMinor === undefined) {
      await this.issue(`fee-missing:${kind}:${reference}`, 'FEE_UNKNOWN', reference, {
        message: 'Provider did not report a verifiable fee',
      });
      return;
    }
    if (!/^\d+$/.test(amountMinor) || BigInt(amountMinor) > BigInt(Number.MAX_SAFE_INTEGER))
      throw new ConflictException('Invalid fee');
    const amount = BigInt(amountMinor);
    const id = `${kind}:${reference}`;
    const changed = await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`fee:${id}`},0))::text`;
      const previous = await tx.providerFee.findUnique({ where: { id } });
      if (previous) return previous.amountMinor !== amount;
      await tx.providerFee.create({ data: { id, kind, reference, amountMinor: amount } });
      await this.journal(
        tx,
        `fee:${id}`,
        'system:NGN:FEES',
        'system:NGN:CLEARING',
        amount,
        'Business-borne Paystack fee',
      );
      return false;
    });
    if (changed)
      await this.issue(`fee-changed:${id}`, 'FEE_CHANGED', reference, {
        reportedMinor: amountMinor,
        message: 'Previously posted provider fee differs; append a reviewed adjustment',
      });
  }

  async processCase(kind: 'REFUND' | 'DISPUTE', providerId: string) {
    const verified = await this.provider.fetchCase(kind, providerId);
    const funding = await this.prisma.fundingRequest.findUnique({
      where: { reference: verified.transaction.reference },
    });
    if (!funding) {
      await this.issue(
        `unknown-case:${kind}:${providerId}`,
        'UNKNOWN_PROVIDER_CASE',
        verified.transaction.reference,
        { kind, providerId },
      );
      throw new NotFoundException('Funding request not found for financial case');
    }
    if (funding.status !== 'SUCCESS' || !matchesPayment(funding, verified.transaction))
      throw new ConflictException('Financial case does not match credited funding');
    // Refunds linked to a dispute are the settlement record for that dispute. Do not debit both.
    const settles =
      (kind === 'REFUND' && verified.status === 'processed') ||
      (kind === 'DISPUTE' &&
        verified.status === 'resolved' &&
        verified.resolution === 'merchant-accepted' &&
        verified.amountMinor > 0n);
    const needsReview =
      kind === 'DISPUTE' && verified.status === 'resolved' && verified.resolution !== 'declined';
    const accountingKind = kind === 'REFUND' && verified.disputeId ? 'DISPUTE' : kind;
    const accountingId = kind === 'REFUND' && verified.disputeId ? verified.disputeId : providerId;
    const result = await this.prisma.$transaction(
      async (tx) => {
        await tx.$queryRaw`SELECT id FROM funding_requests WHERE id=${funding.id} FOR UPDATE`;
        await tx.$queryRaw`SELECT id FROM wallets WHERE id=${funding.walletId} FOR UPDATE`;
        const wallet = await tx.wallet.findUniqueOrThrow({ where: { id: funding.walletId } });
        let financialCase = await tx.financialCase.findUnique({
          where: { kind_providerId: { kind: accountingKind, providerId: accountingId } },
        });
        if (financialCase?.applied) {
          if (financialCase.amountMinor !== verified.amountMinor || !settles)
            throw new ConflictException('Previously applied financial outcome changed');
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
        if (
          (kind === 'DISPUTE' &&
            verified.status !== 'resolved' &&
            verified.status !== 'archived') ||
          needsReview
        ) {
          await tx.wallet.update({ where: { id: wallet.id }, data: { outgoingFrozen: true } });
        }
        if (!settles) return financialCase;
        if (verified.amountMinor <= 0n || wallet.closedAt)
          throw new ConflictException('Refund requires reconciliation');
        const total = await tx.financialCase.aggregate({
          where: { fundingId: funding.id, applied: true },
          _sum: { amountMinor: true },
        });
        if ((total._sum.amountMinor ?? 0n) + verified.amountMinor > funding.amountMinor)
          throw new ConflictException(
            'Cumulative recoveries exceed the funding amount; investigate overlap',
          );
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
        await this.journal(
          tx,
          `case-shortfall:${applied.id}`,
          'system:NGN:ADJUSTMENTS',
          'system:NGN:CLEARING',
          shortfall,
          'Unrecovered refund principal requiring investigation',
        );
        if (shortfall > 0n)
          await tx.wallet.update({ where: { id: wallet.id }, data: { outgoingFrozen: true } });
        return applied;
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted },
    );
    if (result.shortfallMinor > 0n)
      await this.issue(`case-shortfall:${result.id}`, 'RECOVERY_SHORTFALL', funding.reference, {
        caseId: result.id,
        walletId: result.walletId,
        shortfallMinor: result.shortfallMinor.toString(),
      });
    if (kind === 'DISPUTE')
      await this.issue(
        `dispute:${providerId}`,
        needsReview ? 'CHARGEBACK_REVIEW' : 'DISPUTE_REVIEW',
        funding.reference,
        {
          caseId: result.id,
          providerStatus: verified.status,
          resolution: verified.resolution,
          message:
            'Review dispute outcome and its linked refund; no second automatic chargeback debit',
        },
      );
    return {
      ...result,
      amountMinor: result.amountMinor.toString(),
      recoveredMinor: result.recoveredMinor.toString(),
      shortfallMinor: result.shortfallMinor.toString(),
    };
  }
}
