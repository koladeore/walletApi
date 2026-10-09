import { LimitsService } from '../limits/limits.service';
import { randomUUID } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Payout } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { PaystackService } from '../paystack/paystack.service';
import { PayoutProviderService } from '../paystack/payout-provider.service';
import type { TransferNotice, VerifiedTransfer } from '../paystack/transfer';
import { formatMinor, MAX_MINOR, parseNaira } from '../common/money/money';

export function matchesTransfer(payout: Payout, notice: TransferNotice): boolean {
  return (
    notice.reference === payout.reference &&
    notice.amountMinor === payout.amountMinor.toString() &&
    notice.currency === payout.currency &&
    notice.domain === payout.providerMode &&
    (!payout.transferCode || payout.transferCode === notice.transferCode)
  );
}

@Injectable()
export class PayoutsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly paystack: PaystackService,
    private readonly provider: PayoutProviderService,
    private readonly limits: LimitsService,
  ) {}
  response(payout: Payout) {
    return {
      id: payout.id,
      reference: payout.reference,
      beneficiaryId: payout.beneficiaryId,
      amount: formatMinor(payout.amountMinor),
      amountMinor: payout.amountMinor.toString(),
      currency: payout.currency,
      status: payout.status,
      providerStatus: payout.providerStatus,
      uncertain: payout.uncertain,
      lastError: payout.lastError,
      createdAt: payout.createdAt,
    };
  }
  private async find(reference: string, userId?: string) {
    const payout = await this.prisma.payout.findFirst({
      where: { reference, ...(userId ? { userId } : {}) },
    });
    if (!payout) throw new NotFoundException('Payout not found');
    return payout;
  }
  async get(userId: string, reference: string) {
    return this.response(await this.find(reference, userId));
  }
  async list(userId: string) {
    return (
      await this.prisma.payout.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        take: 100,
      })
    ).map((row) => this.response(row));
  }

  async create(
    userId: string,
    beneficiaryId: string,
    amount: string,
    key: string,
    expectedAuthVersion?: number,
  ) {
    if (typeof key !== 'string' || !/^[A-Za-z0-9._:-]{1,200}$/.test(key))
      throw new BadRequestException('Valid x-idempotency-key required');
    const amountMinor = parseNaira(amount);
    if (amountMinor > BigInt(Number.MAX_SAFE_INTEGER))
      throw new BadRequestException('Amount exceeds provider range');
    this.paystack.assertEnabled();
    const payout = await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`payout:${userId}:${key}`}, 0))::text`;
      const existing = await tx.payout.findUnique({
        where: { userId_idempotencyKey: { userId, idempotencyKey: key } },
      });
      if (existing) {
        if (existing.amountMinor !== amountMinor || existing.beneficiaryId !== beneficiaryId)
          throw new ConflictException('Idempotency key was used for a different payout');
        return existing;
      }
      await tx.$queryRaw`SELECT id FROM users WHERE id=${userId} FOR SHARE`;
      const user = await tx.user.findUnique({ where: { id: userId }, include: { wallet: true } });
      if (!user || !user.isActive || user.closedAt)
        throw new ForbiddenException('Active user required');
      if (expectedAuthVersion !== undefined && user.authVersion !== expectedAuthVersion)
        throw new ForbiddenException('Authentication changed; repeat step-up');
      if (!user.wallet) throw new NotFoundException('Wallet not found');
      const beneficiary = await tx.beneficiary.findFirst({ where: { id: beneficiaryId, userId } });
      if (!beneficiary) throw new NotFoundException('Beneficiary not found');
      if (beneficiary.providerMode !== 'test' || beneficiary.currency !== 'NGN')
        throw new BadRequestException('Test NGN beneficiary required');
      await tx.$queryRaw`SELECT id FROM wallets WHERE id=${user.wallet.id} FOR UPDATE`;
      const wallet = await tx.wallet.findUniqueOrThrow({ where: { id: user.wallet.id } });
      if (wallet.closedAt || wallet.currency !== 'NGN')
        throw new ConflictException('Open NGN wallet required');
      if (wallet.outgoingFrozen)
        throw new ForbiddenException('Wallet outgoing money is frozen for investigation');
      if (wallet.balanceMinor - wallet.reservedMinor < amountMinor)
        throw new BadRequestException('Insufficient available balance');
      const reference = `payout-${randomUUID()}`;
      await this.limits.consume(tx, userId, amountMinor, reference);
      // The database reservation trigger updates reservedMinor; commit before external I/O.
      const reservation = await tx.withdrawalReservation.create({
        data: { reference, walletId: wallet.id, amountMinor, currency: 'NGN' },
      });
      return tx.payout.create({
        data: {
          reference,
          idempotencyKey: key,
          userId,
          walletId: wallet.id,
          beneficiaryId,
          reservationId: reservation.id,
          amountMinor,
          bankCode: beneficiary.bankCode,
          accountNumber: beneficiary.accountNumber,
          accountName: beneficiary.accountName,
        },
      });
    });
    if (!payout.submittedAt && payout.status === 'PENDING') await this.dispatch(payout.reference);
    return this.get(userId, payout.reference);
  }

  async dispatch(reference: string): Promise<void> {
    const payout = await this.find(reference);
    if (payout.submittedAt || payout.status !== 'PENDING') return;
    const now = new Date();
    const claimed = await this.prisma.payout.updateMany({
      where: {
        id: payout.id,
        submittedAt: null,
        status: 'PENDING',
        OR: [{ lockedUntil: null }, { lockedUntil: { lt: now } }],
      },
      data: { lockedUntil: new Date(now.getTime() + 120_000) },
    });
    if (!claimed.count) return;
    try {
      const recipientCode = payout.recipientCode ?? (await this.provider.createRecipient(payout));
      // A compare-and-set commits the submission marker before sending. A crash here is uncertain.
      const submit = await this.prisma.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT id FROM payouts WHERE id=${payout.id} FOR UPDATE`;
        await tx.$queryRaw`SELECT id FROM wallets WHERE id=${payout.walletId} FOR UPDATE`;
        const wallet = await tx.wallet.findUniqueOrThrow({ where: { id: payout.walletId } });
        if (wallet.outgoingFrozen || wallet.closedAt)
          throw new ForbiddenException('Wallet outgoing money is frozen for investigation');
        return tx.payout.updateMany({
          where: { id: payout.id, submittedAt: null, status: 'PENDING' },
          data: { recipientCode, submittedAt: new Date(), status: 'PROCESSING', uncertain: true },
        });
      });
      if (!submit.count) return;
      const notice = await this.provider.initiate({
        reference: payout.reference,
        amountMinor: payout.amountMinor,
        recipientCode,
      });
      if (!matchesTransfer(payout, notice))
        throw new ConflictException('Payout submission response mismatch');
      await this.prisma.payout.updateMany({
        where: { id: payout.id, status: 'PROCESSING', transferCode: null },
        data: { transferCode: notice.transferCode, providerStatus: notice.status },
      });
      await this.verify(reference);
    } catch {
      // Recipient errors are safe to retry; transfer errors must be verified, never resubmitted.
      await this.prisma.payout.updateMany({
        where: { id: payout.id, status: { in: ['PENDING', 'PROCESSING'] } },
        data: {
          uncertain: true,
          lastError: 'Provider outcome requires verification; funds remain reserved',
          nextCheckAt: new Date(Date.now() + 60_000),
        },
      });
    } finally {
      await this.prisma.payout.updateMany({
        where: { id: payout.id },
        data: { lockedUntil: null },
      });
    }
  }

  async verify(reference: string, userId?: string, event?: TransferNotice) {
    const expected = await this.find(reference, userId);
    if (event && !matchesTransfer(expected, event))
      throw new ConflictException('Payout webhook mismatch');
    if (expected.status === 'REVERSED') return this.response(expected);
    if (!expected.submittedAt || !expected.recipientCode) return this.response(expected);
    try {
      const verified = await this.provider.verify(reference);
      if (
        !matchesTransfer(expected, verified) ||
        verified.recipientCode !== expected.recipientCode ||
        verified.accountNumber !== expected.accountNumber ||
        verified.bankCode !== expected.bankCode ||
        (event && verified.transferCode !== event.transferCode)
      )
        throw new ConflictException('Verified payout details do not match');
      return this.response(await this.apply(expected.id, verified));
    } catch (error) {
      await this.prisma.payout.updateMany({
        where: { id: expected.id, status: { not: 'REVERSED' } },
        data: {
          uncertain: true,
          lastError: 'Verification unavailable or conflicting; funds require reconciliation',
          nextCheckAt: new Date(Date.now() + 60_000),
        },
      });
      throw error;
    }
  }

  private async apply(id: string, verified: VerifiedTransfer) {
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM payouts WHERE id=${id} FOR UPDATE`;
      const payout = await tx.payout.findUniqueOrThrow({ where: { id } });
      if (!matchesTransfer(payout, verified))
        throw new ConflictException('Payout identity changed');
      if (payout.status === 'REVERSED') return payout;
      if (payout.status === 'FAILED') {
        if (verified.status !== 'failed')
          throw new ConflictException(
            'Provider changed a released payout; investigate before moving funds',
          );
        return payout;
      }
      if (payout.status === 'SUCCESS' && verified.status !== 'reversed') return payout;
      await tx.$queryRaw`SELECT id FROM wallets WHERE id=${payout.walletId} FOR UPDATE`;
      const reservation = await tx.withdrawalReservation.findUniqueOrThrow({
        where: { id: payout.reservationId },
      });
      const common = {
        transferCode: verified.transferCode,
        providerStatus: verified.status,
        uncertain: false,
        lastError: null,
        nextCheckAt: new Date(Date.now() + (verified.status === 'success' ? 3600_000 : 60_000)),
      };
      if (verified.status === 'success') {
        if (reservation.status !== 'PENDING')
          throw new ConflictException('Payout reservation already resolved');
        await tx.withdrawalReservation.update({
          where: { id: reservation.id },
          data: { status: 'CAPTURED' },
        });
        return tx.payout.update({ where: { id }, data: { ...common, status: 'SUCCESS' } });
      }
      if (verified.status === 'failed' || verified.status === 'reversed') {
        if (reservation.status === 'PENDING') {
          await tx.withdrawalReservation.update({
            where: { id: reservation.id },
            data: { status: 'RELEASED' },
          });
        } else if (verified.status === 'reversed' && reservation.status === 'CAPTURED') {
          const wallet = await tx.wallet.findUniqueOrThrow({ where: { id: payout.walletId } });
          if (wallet.closedAt || wallet.balanceMinor + payout.amountMinor > MAX_MINOR)
            throw new ConflictException('Reversal requires manual reconciliation');
          await tx.payout.update({ where: { id }, data: { ...common, status: 'REVERSED' } });
          await tx.transaction.create({
            data: {
              id: `payout-reversal:${id}`,
              referenceId: `payout-reversal:${payout.reference}`,
              reversalOfId: `withdrawal:${reservation.id}`,
              amountMinor: payout.amountMinor,
              currency: payout.currency,
              type: 'CREDIT',
              status: 'SUCCESS',
              receiverWalletId: payout.walletId,
              metadata: { payoutId: id, providerTransferCode: verified.transferCode },
            },
          });
          await tx.wallet.update({
            where: { id: payout.walletId },
            data: { balanceMinor: { increment: payout.amountMinor } },
          });
        } else throw new ConflictException('Payout reservation outcome conflicts');
        return tx.payout.update({
          where: { id },
          data: { ...common, status: verified.status === 'failed' ? 'FAILED' : 'REVERSED' },
        });
      }
      return tx.payout.update({
        where: { id },
        data: {
          ...common,
          status: 'PROCESSING',
          uncertain: !['pending', 'processing', 'ongoing', 'queued', 'received', 'otp'].includes(
            verified.status,
          ),
          lastError:
            verified.status === 'otp'
              ? 'Provider OTP authorization is required; funds remain reserved'
              : ['pending', 'processing', 'ongoing', 'queued', 'received'].includes(verified.status)
                ? null
                : 'Unrecognized provider outcome; funds remain reserved for reconciliation',
        },
      });
    });
  }
}
