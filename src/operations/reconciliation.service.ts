import { ConflictException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { OperationsProviderService, providerId } from '../paystack/operations-provider.service';
import { PaystackService } from '../paystack/paystack.service';
import { PayoutProviderService } from '../paystack/payout-provider.service';
import { matchesPayment } from '../funding/confirmation.service';
import { matchesTransfer } from '../payouts/payouts.service';
import { FinancialService } from './financial.service';

@Injectable()
export class ReconciliationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly inventory: OperationsProviderService,
    private readonly paystack: PaystackService,
    private readonly payoutProvider: PayoutProviderService,
    private readonly financial: FinancialService,
  ) {}

  async run() {
    this.paystack.assertEnabled();
    const claimed = await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended('financial-reconciliation',0))::text`;
      const lease = await tx.reconciliationLease.findUnique({ where: { id: 'main' } });
      if (lease && lease.lockedUntil > new Date()) return false;
      await tx.reconciliationLease.upsert({
        where: { id: 'main' },
        create: { id: 'main', lockedUntil: new Date(Date.now() + 3600_000) },
        update: { lockedUntil: new Date(Date.now() + 3600_000) },
      });
      return true;
    });
    if (!claimed) throw new ConflictException('Reconciliation already running');
    await this.prisma.reconciliationRun.updateMany({
      where: { status: 'RUNNING', startedAt: { lt: new Date(Date.now() - 3600_000) } },
      data: {
        status: 'INCOMPLETE',
        completedAt: new Date(),
        summary: { message: 'Previous reconciliation process stopped before completion' },
      },
    });
    const run = await this.prisma.reconciliationRun.create({ data: {} });
    let failures = 0;
    let checked = 0;
    const flag = async (
      key: string,
      kind: string,
      reference: string | null,
      details: Prisma.InputJsonObject,
    ) => {
      failures++;
      await this.financial.issue(key, kind, reference, details);
    };
    try {
      const internal = await this.prisma.$transaction(
        async (tx) => {
          const wallets = await tx.$queryRaw<
            { id: string; balance: string; ledger: string; reserved: string; pending: string }[]
          >`SELECT w.id,w."balanceMinor"::text AS balance,w."reservedMinor"::text AS reserved,COALESCE((SELECT sum(CASE WHEN e.side='CREDIT' THEN e."amountMinor"::numeric ELSE -e."amountMinor"::numeric END) FROM ledger_entries e JOIN ledger_accounts a ON a.id=e."accountId" WHERE a."walletId"=w.id),0)::text AS ledger,COALESCE((SELECT sum(r."amountMinor"::numeric) FROM withdrawal_reservations r WHERE r."walletId"=w.id AND r.status='PENDING'),0)::text AS pending FROM wallets w`;
          const journals = await tx.$queryRaw<
            { id: string; difference: string; entries: number }[]
          >`SELECT j.id,COALESCE(sum(CASE WHEN e.side='DEBIT' THEN e."amountMinor"::numeric ELSE -e."amountMinor"::numeric END),0)::text AS difference,count(e.id)::int AS entries FROM ledger_journals j LEFT JOIN ledger_entries e ON e."journalId"=j.id GROUP BY j.id HAVING count(e.id)<2 OR COALESCE(sum(CASE WHEN e.side='DEBIT' THEN e."amountMinor"::numeric ELSE -e."amountMinor"::numeric END),0)<>0`;
          return { wallets, journals };
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
      );
      for (const wallet of internal.wallets) {
        checked++;
        if (
          BigInt(wallet.balance) !== BigInt(wallet.ledger) ||
          BigInt(wallet.reserved) !== BigInt(wallet.pending)
        )
          await flag(`wallet:${wallet.id}`, 'WALLET_LEDGER_MISMATCH', null, {
            walletId: wallet.id,
            ...wallet,
          });
      }
      for (const journal of internal.journals)
        await flag(`journal:${journal.id}`, 'UNBALANCED_JOURNAL', null, journal);

      const fundingInventory = await this.inventory.inventory('transaction');
      const fundingReferences = new Set<string>();
      for (const item of fundingInventory) {
        if (item.domain !== 'test' || typeof item.reference !== 'string') {
          await flag(`transaction-invalid:${String(item.id)}`, 'PROVIDER_RECORD_INVALID', null, {
            resource: 'transaction',
          });
          continue;
        }
        fundingReferences.add(item.reference);
        if (
          item.status === 'success' &&
          !(await this.prisma.fundingRequest.findUnique({ where: { reference: item.reference } }))
        )
          await flag(
            `provider-funding:${item.reference}`,
            'UNMATCHED_PROVIDER_FUNDING',
            item.reference,
            { message: 'Successful provider payment has no local funding request' },
          );
      }
      const fundings = await this.prisma.fundingRequest.findMany();
      for (const request of fundings) {
        checked++;
        if (!fundingReferences.has(request.reference)) {
          if (request.status === 'SUCCESS' || request.createdAt.getTime() < Date.now() - 3600_000)
            await flag(
              `funding-missing:${request.reference}`,
              'PROVIDER_FUNDING_MISSING',
              request.reference,
              { localStatus: request.status },
            );
          continue;
        }
        try {
          const payment = await this.paystack.verifyPayment(request.reference);
          const current = await this.prisma.fundingRequest.findUniqueOrThrow({
            where: { id: request.id },
          });
          if (
            !matchesPayment(current, payment) ||
            (current.status === 'SUCCESS' && payment.status !== 'success') ||
            (current.status !== 'SUCCESS' && payment.status === 'success')
          )
            await flag(
              `funding:${request.reference}`,
              'FUNDING_STATUS_MISMATCH',
              request.reference,
              { localStatus: current.status, providerStatus: payment.status },
            );
          if (current.status === 'SUCCESS' && matchesPayment(current, payment)) {
            await this.financial.fee('FUNDING', request.reference, payment.feeMinor);
            const posting = await this.prisma.transaction.findUnique({
              where: { id: `funding:${request.id}` },
              include: { ledgerJournal: true },
            });
            if (
              !posting?.ledgerJournal ||
              posting.amountMinor !== request.amountMinor ||
              posting.receiverWalletId !== request.walletId
            )
              await flag(
                `funding-posting:${request.reference}`,
                'FUNDING_POSTING_MISMATCH',
                request.reference,
                {},
              );
          }
        } catch {
          await flag(
            `funding-unverified:${request.reference}`,
            'PROVIDER_CHECK_UNAVAILABLE',
            request.reference,
            { resource: 'funding' },
          );
        }
      }

      const transferInventory = await this.inventory.inventory('transfer');
      const transferReferences = new Set<string>();
      for (const item of transferInventory) {
        if (item.domain !== 'test' || typeof item.reference !== 'string') {
          await flag(`transfer-invalid:${String(item.id)}`, 'PROVIDER_RECORD_INVALID', null, {
            resource: 'transfer',
          });
          continue;
        }
        transferReferences.add(item.reference);
        if (!(await this.prisma.payout.findUnique({ where: { reference: item.reference } })))
          await flag(
            `provider-payout:${item.reference}`,
            'UNMATCHED_PROVIDER_PAYOUT',
            item.reference,
            { providerStatus: String(item.status) },
          );
      }
      for (const payout of await this.prisma.payout.findMany()) {
        checked++;
        const reservation = await this.prisma.withdrawalReservation.findUnique({
          where: { id: payout.reservationId },
        });
        const expected =
          payout.status === 'SUCCESS'
            ? 'CAPTURED'
            : payout.status === 'FAILED'
              ? 'RELEASED'
              : ['PENDING', 'PROCESSING'].includes(payout.status)
                ? 'PENDING'
                : null;
        if (!reservation || (expected && reservation.status !== expected))
          await flag(
            `payout-reservation:${payout.reference}`,
            'PAYOUT_RESERVATION_MISMATCH',
            payout.reference,
            { localStatus: payout.status, reservationStatus: reservation?.status ?? null },
          );
        if (!transferReferences.has(payout.reference)) {
          if (payout.submittedAt)
            await flag(`payout-missing:${payout.reference}`, 'UNCERTAIN_PAYOUT', payout.reference, {
              message:
                'Provider has no verified record; keep reservation and investigate before retrying',
            });
          continue;
        }
        try {
          const transfer = await this.payoutProvider.verify(payout.reference);
          const current = await this.prisma.payout.findUniqueOrThrow({ where: { id: payout.id } });
          const mapped =
            transfer.status === 'success'
              ? 'SUCCESS'
              : transfer.status === 'failed'
                ? 'FAILED'
                : transfer.status === 'reversed'
                  ? 'REVERSED'
                  : 'PROCESSING';
          if (
            !matchesTransfer(current, transfer) ||
            current.recipientCode !== transfer.recipientCode ||
            current.bankCode !== transfer.bankCode ||
            current.accountNumber !== transfer.accountNumber ||
            current.status !== mapped
          )
            await flag(`payout:${payout.reference}`, 'PAYOUT_PROVIDER_MISMATCH', payout.reference, {
              localStatus: current.status,
              providerStatus: transfer.status,
            });
          if (
            matchesTransfer(current, transfer) &&
            current.recipientCode === transfer.recipientCode &&
            current.accountNumber === transfer.accountNumber &&
            current.bankCode === transfer.bankCode
          )
            await this.financial.fee('PAYOUT', payout.reference, transfer.feeMinor);
        } catch {
          await flag(
            `payout-unverified:${payout.reference}`,
            'PROVIDER_CHECK_UNAVAILABLE',
            payout.reference,
            { resource: 'payout' },
          );
        }
      }
      for (const resource of ['refund', 'dispute'] as const) {
        for (const item of await this.inventory.inventory(resource)) {
          try {
            const id = providerId(item.id);
            await this.financial.processCase(resource === 'refund' ? 'REFUND' : 'DISPUTE', id);
            checked++;
          } catch {
            await flag(
              `case-unverified:${resource}:${String(item.id)}`,
              'FINANCIAL_CASE_UNVERIFIED',
              null,
              { resource, providerId: String(item.id) },
            );
          }
        }
      }
      const providerBalance = await this.inventory.balance();
      const [clearing] = await this.prisma.$queryRaw<
        { amount: string }[]
      >`SELECT COALESCE(sum(CASE WHEN side='DEBIT' THEN "amountMinor"::numeric ELSE -"amountMinor"::numeric END),0)::text AS amount FROM ledger_entries WHERE "accountId"='system:NGN:CLEARING'`;
      if (providerBalance !== BigInt(clearing.amount))
        await flag('provider-balance:NGN', 'PROVIDER_CLEARING_DIFFERENCE', null, {
          providerMinor: providerBalance.toString(),
          ledgerMinor: clearing.amount,
          message:
            'Investigate settlements, external transfers, opening balances, fee timing, or missing events; never auto-adjust wallet balances',
        });
      const unresolved = await this.prisma.reconciliationIssue.count({ where: { status: 'OPEN' } });
      return await this.prisma.reconciliationRun.update({
        where: { id: run.id },
        data: {
          status: failures || unresolved ? 'DIFFERENCES' : 'CLEAN',
          completedAt: new Date(),
          summary: {
            checked,
            findings: failures,
            unresolved,
            providerBalanceMinor: providerBalance.toString(),
            clearingMinor: clearing.amount,
          },
        },
      });
    } catch {
      await flag(`run-incomplete:${run.id}`, 'RECONCILIATION_INCOMPLETE', null, {
        message: 'Provider inventory or database checks could not complete; no clean claim is made',
      });
      return await this.prisma.reconciliationRun.update({
        where: { id: run.id },
        data: {
          status: 'INCOMPLETE',
          completedAt: new Date(),
          summary: { checked, findings: failures },
        },
      });
    } finally {
      await this.prisma.reconciliationLease.update({
        where: { id: 'main' },
        data: { lockedUntil: new Date() },
      });
    }
  }
}
