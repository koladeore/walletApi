import { Injectable, ConflictException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { FundingRequest } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { PaystackService } from '../paystack/paystack.service';
import type { PaystackPayment } from '../paystack/payment';
import { MAX_MINOR } from '../common/money/money';

export function matchesPayment(request: FundingRequest, payment: PaystackPayment): boolean {
  return (
    payment.reference === request.reference &&
    payment.amountMinor === request.amountMinor.toString() &&
    payment.currency === request.currency &&
    payment.domain === request.providerMode &&
    request.provider === 'PAYSTACK' &&
    (!request.providerTransactionId || payment.transactionId === request.providerTransactionId) &&
    payment.email.toLowerCase() === request.expectedEmail.toLowerCase()
  );
}

@Injectable()
export class ConfirmationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly paystack: PaystackService,
  ) {}

  async confirm(
    reference: string,
    userId?: string,
    eventPayment?: PaystackPayment,
  ): Promise<FundingRequest> {
    const expected = await this.prisma.fundingRequest.findFirst({
      where: { reference, ...(userId ? { userId } : {}) },
    });
    if (!expected) throw new NotFoundException('Funding request not found');
    if (
      eventPayment &&
      (!matchesPayment(expected, eventPayment) || eventPayment.status !== 'success')
    )
      throw new ConflictException('Webhook payment does not match the funding request');
    if (expected.status === 'SUCCESS') return expected;
    // The API response, not callback parameters or webhook claims, confirms actual payment.
    const payment = await this.paystack.verifyPayment(reference);
    if (!matchesPayment(expected, payment))
      throw new ConflictException('Verified payment does not match the funding request');
    if (eventPayment && eventPayment.transactionId !== payment.transactionId)
      throw new ConflictException('Webhook transaction does not match the verified payment');

    return this.prisma.$transaction(
      async (tx) => {
        await tx.$queryRaw`SELECT id FROM funding_requests WHERE id=${expected.id} FOR UPDATE`;
        const request = await tx.fundingRequest.findUniqueOrThrow({ where: { id: expected.id } });
        if (request.status === 'SUCCESS') return request;
        if (!matchesPayment(request, payment))
          throw new ConflictException('Funding details changed');
        if (payment.status !== 'success') {
          return tx.fundingRequest.update({
            where: { id: request.id },
            data: {
              lastCheckedAt: new Date(),
              status: ['failed', 'abandoned', 'reversed'].includes(payment.status)
                ? 'FAILED'
                : 'PENDING',
            },
          });
        }
        await tx.$queryRaw`SELECT id FROM wallets WHERE id=${request.walletId} FOR UPDATE`;
        const wallet = await tx.wallet.findUniqueOrThrow({ where: { id: request.walletId } });
        if (
          wallet.userId !== request.userId ||
          wallet.currency !== request.currency ||
          wallet.closedAt
        )
          throw new ConflictException(
            'Wallet cannot receive this payment; payment requires reconciliation',
          );
        if (wallet.balanceMinor + request.amountMinor > MAX_MINOR)
          throw new ConflictException('Wallet balance limit exceeded');
        const confirmed = await tx.fundingRequest.update({
          where: { id: request.id },
          data: {
            status: 'SUCCESS',
            providerTransactionId: payment.transactionId,
            verifiedAt: new Date(),
            lastCheckedAt: new Date(),
          },
        });
        // Database trigger posts debit to provider clearing and credit to customer liability.
        await tx.transaction.create({
          data: {
            id: `funding:${request.id}`,
            referenceId: `paystack:${request.reference}`,
            amountMinor: request.amountMinor,
            currency: request.currency,
            type: 'CREDIT',
            status: 'SUCCESS',
            receiverWalletId: request.walletId,
            metadata: {
              fundingSource: 'PAYSTACK',
              fundingRequestId: request.id,
              providerTransactionId: payment.transactionId,
              providerMode: payment.domain,
            },
          },
        });
        await tx.wallet.update({
          where: { id: wallet.id },
          data: { balanceMinor: { increment: request.amountMinor } },
        });
        return confirmed;
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted },
    );
  }
}
