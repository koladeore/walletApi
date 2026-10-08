import { randomUUID } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, FundingStatus } from '@prisma/client';
import type { FundingRequest } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { PaystackService } from '../paystack/paystack.service';
import { formatMinor, parseNaira } from '../common/money/money';

@Injectable()
export class FundingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly paystack: PaystackService,
  ) {}

  private response(request: FundingRequest) {
    return {
      reference: request.reference,
      amount: formatMinor(request.amountMinor),
      amountMinor: request.amountMinor.toString(),
      currency: request.currency,
      status: request.status,
      authorizationUrl: request.authorizationUrl,
      accessCode: request.accessCode,
    };
  }

  async get(userId: string, reference: string) {
    const request = await this.prisma.fundingRequest.findFirst({ where: { userId, reference } });
    if (!request) throw new NotFoundException('Funding request not found');
    return this.response(request);
  }

  async initialize(userId: string, amount: string, key: string) {
    if (typeof key !== 'string' || !/^[A-Za-z0-9._:-]{1,200}$/.test(key))
      throw new BadRequestException(
        'x-idempotency-key must contain 1–200 letters, digits, dots, underscores, colons or hyphens',
      );
    const amountMinor = parseNaira(amount);
    if (amountMinor > BigInt(Number.MAX_SAFE_INTEGER))
      throw new BadRequestException('Amount exceeds the supported provider range');
    this.paystack.assertEnabled();

    // Serialize same-user retries, then commit the expected details BEFORE external I/O.
    const reservation = await this.prisma.$transaction(
      async (tx) => {
        await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`funding:${userId}:${key}`}, 0))::text`;
        const existing = await tx.fundingRequest.findUnique({
          where: { userId_idempotencyKey: { userId, idempotencyKey: key } },
        });
        if (existing) {
          if (existing.amountMinor !== amountMinor || existing.currency !== 'NGN')
            throw new ConflictException('Idempotency key was used for a different funding request');
          if (!existing.authorizationUrl)
            throw new ConflictException({
              message:
                'Initialization is in progress or uncertain; check this reference before creating another payment',
              reference: existing.reference,
              status: existing.status,
            });
          return { request: existing, created: false };
        }
        const user = await tx.user.findUnique({ where: { id: userId }, include: { wallet: true } });
        if (!user || !user.isActive || user.closedAt)
          throw new ForbiddenException('Active user required');
        if (!user.wallet) throw new NotFoundException('Wallet not found');
        if (user.wallet.closedAt) throw new ConflictException('Wallet is closed');
        if (user.wallet.currency !== 'NGN')
          throw new BadRequestException('Paystack funding currently supports NGN wallets only');
        const request = await tx.fundingRequest.create({
          data: {
            reference: `fund-${randomUUID()}`,
            idempotencyKey: key,
            userId,
            walletId: user.wallet.id,
            expectedEmail: user.email,
            amountMinor,
            currency: 'NGN',
          },
        });
        return { request, created: true };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted },
    );
    const { request } = reservation;
    if (!reservation.created) return this.response(request);

    try {
      const checkout = await this.paystack.initializePayment({
        email: request.expectedEmail,
        amountMinor: request.amountMinor,
        currency: 'NGN',
        reference: request.reference,
      });
      await this.prisma.fundingRequest.updateMany({
        where: { id: request.id, status: FundingStatus.INITIALIZING },
        data: { ...checkout, status: FundingStatus.PENDING },
      });
      return await this.get(userId, request.reference);
    } catch (error) {
      // A timeout or persistence failure does not prove Paystack did not create checkout.
      // Keep the reference for reconciliation; never issue a fresh payment on a retry.
      await this.prisma.fundingRequest.updateMany({
        where: { id: request.id, status: FundingStatus.INITIALIZING },
        data: { status: FundingStatus.INITIALIZATION_UNKNOWN },
      });
      throw error;
    }
  }
}
