import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { formatMinor, parseNaira } from '../common/money/money';

export function lagosDay(date = new Date()) {
  return new Date(date.getTime() + 3600_000).toISOString().slice(0, 10);
}
@Injectable()
export class LimitsService {
  private readonly policies: Record<string, { transaction: bigint; daily: bigint }>;
  constructor(
    private readonly prisma: PrismaService,
    config: ConfigService,
  ) {
    this.policies = {
      BASIC: {
        transaction: parseNaira(config.get<string>('LIMIT_BASIC_TRANSACTION_NGN') ?? '50000'),
        daily: parseNaira(config.get<string>('LIMIT_BASIC_DAILY_NGN') ?? '100000'),
      },
      VERIFIED: {
        transaction: parseNaira(config.get<string>('LIMIT_VERIFIED_TRANSACTION_NGN') ?? '100000'),
        daily: parseNaira(config.get<string>('LIMIT_VERIFIED_DAILY_NGN') ?? '500000'),
      },
    };
    for (const policy of Object.values(this.policies))
      if (policy.transaction > policy.daily)
        throw new Error('Transaction limit must not exceed daily limit');
  }
  // Caller holds the sender wallet FOR UPDATE and user FOR SHARE throughout the transaction.
  async consume(
    tx: Prisma.TransactionClient,
    userId: string,
    amountMinor: bigint,
    reference: string,
  ) {
    const user = await tx.user.findUniqueOrThrow({ where: { id: userId } });
    if (!user.isActive || user.closedAt || !user.emailVerifiedAt)
      throw new ForbiddenException('Active account and verified email required');
    const policy = this.policies[user.accountTier];
    if (!policy) throw new ForbiddenException('Unsupported account tier');
    if (amountMinor > policy.transaction)
      throw new BadRequestException('Transaction limit exceeded');
    const day = lagosDay();
    const id = `${userId}:${day}`;
    const current = await tx.dailyOutgoing.upsert({
      where: { id },
      create: { id, userId, day },
      update: {},
    });
    if (current.amountMinor + amountMinor > policy.daily)
      throw new BadRequestException('Daily outgoing limit exceeded');
    await tx.dailyOutgoing.update({
      where: { id },
      data: { amountMinor: { increment: amountMinor } },
    });
    const since = new Date(Date.now() - 10 * 60_000);
    const wallet = await tx.wallet.findUniqueOrThrow({ where: { userId } });
    const count =
      (await tx.transaction.count({
        where: {
          senderWalletId: wallet.id,
          type: 'TRANSFER',
          status: 'SUCCESS',
          reversalOfId: null,
          createdAt: { gte: since },
        },
      })) +
      (await tx.payout.count({ where: { userId, createdAt: { gte: since } } })) +
      1;
    if (count >= 5 || current.amountMinor + amountMinor >= (policy.daily * 9n) / 10n) {
      const kind = count >= 5 ? 'OUTGOING_VELOCITY' : 'DAILY_LIMIT_NEAR';
      await tx.activityFlag.upsert({
        where: { key: `${id}:${kind}` },
        create: {
          key: `${id}:${kind}`,
          userId,
          kind,
          details: {
            reference,
            countInTenMinutes: count,
            day,
            usedMinor: (current.amountMinor + amountMinor).toString(),
          },
        },
        update: {},
      });
    }
  }
  async status(userId: string) {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      include: { wallet: true },
    });
    const policy = this.policies[user.accountTier];
    const day = lagosDay();
    const usage = await this.prisma.dailyOutgoing.findUnique({ where: { id: `${userId}:${day}` } });
    const used = usage?.amountMinor ?? 0n;
    const daily = user.emailVerifiedAt ? policy.daily : 0n;
    return {
      tier: user.accountTier,
      emailVerified: Boolean(user.emailVerifiedAt),
      timezone: 'Africa/Lagos',
      day,
      transactionLimit: formatMinor(user.emailVerifiedAt ? policy.transaction : 0n),
      dailyLimit: formatMinor(daily),
      usedToday: formatMinor(used),
      remainingToday: formatMinor(used < daily ? daily - used : 0n),
      outgoingFrozen: user.wallet?.outgoingFrozen ?? false,
    };
  }
}
