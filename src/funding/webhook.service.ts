import { createHash } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  Optional,
  UnauthorizedException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { PaystackService } from '../paystack/paystack.service';
import { parsePayment, record } from '../paystack/payment';
import type { PaystackPayment } from '../paystack/payment';
import { ConfirmationService } from './confirmation.service';
import { parseTransferNotice } from '../paystack/transfer';
import type { TransferNotice } from '../paystack/transfer';
import { PayoutsService } from '../payouts/payouts.service';
import { FinancialService } from '../operations/financial.service';
import { providerId } from '../paystack/operations-provider.service';

@Injectable()
export class WebhookService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly paystack: PaystackService,
    private readonly confirmation: ConfirmationService,
    @Optional() private readonly payouts?: PayoutsService,
    @Optional() private readonly financial?: FinancialService,
  ) {}

  async receive(raw: Buffer | undefined, signature: string | undefined) {
    if (!this.paystack.authenticateWebhook(raw, signature))
      throw new UnauthorizedException('Invalid Paystack signature');
    if (!raw) throw new BadRequestException('Raw webhook body required');
    let body: Record<string, unknown>;
    try {
      body = record(JSON.parse(raw.toString('utf8')) as unknown);
    } catch {
      throw new BadRequestException('Invalid webhook payload');
    }
    if (typeof body.event !== 'string')
      throw new BadRequestException('Webhook event type required');
    const id = createHash('sha256').update(raw).digest('hex');
    // Retain only fields needed for matching; omit card authorizations and other personal data.
    let payment:
      | PaystackPayment
      | TransferNotice
      | { kind: 'REFUND' | 'DISPUTE'; providerId: string; reference: string }
      | undefined;
    if (body.event === 'charge.success') payment = parsePayment(body.data);
    if (['transfer.success', 'transfer.failed', 'transfer.reversed'].includes(body.event)) {
      try {
        payment = parseTransferNotice(body.data);
      } catch {
        throw new BadRequestException('Invalid transfer webhook');
      }
    }
    if (body.event.startsWith('refund.') || body.event.startsWith('charge.dispute.')) {
      try {
        const data = record(body.data);
        payment = {
          kind: body.event.startsWith('refund.') ? 'REFUND' : 'DISPUTE',
          providerId: providerId(data.id),
          reference:
            typeof data.transaction === 'object' &&
            typeof record(data.transaction).reference === 'string'
              ? String(record(data.transaction).reference)
              : '',
        };
      } catch {
        throw new BadRequestException('Invalid financial webhook');
      }
    }
    await this.prisma.paystackEvent.createMany({
      skipDuplicates: true,
      data: [
        {
          id,
          eventType: body.event,
          reference: payment?.reference,
          payment: payment ? { ...payment } : {},
          status: payment ? 'RECEIVED' : 'IGNORED',
          processedAt: payment ? null : new Date(),
        },
      ],
    });
    return { received: true };
  }

  async process(id: string): Promise<void> {
    // A persistent lease lets another process recover after a crash.
    const now = new Date();
    const claimed = await this.prisma.paystackEvent.updateMany({
      where: {
        id,
        status: 'RECEIVED',
        nextAttemptAt: { lte: now },
        OR: [{ lockedUntil: null }, { lockedUntil: { lt: now } }],
      },
      data: { lockedUntil: new Date(now.getTime() + 60_000), attempts: { increment: 1 } },
    });
    if (!claimed.count) return;
    const event = await this.prisma.paystackEvent.findUniqueOrThrow({ where: { id } });
    try {
      // Only this service writes payment, from the authenticated and parsed event above.
      if (event.eventType.startsWith('refund.') || event.eventType.startsWith('charge.dispute.')) {
        if (!this.financial) throw new Error('Financial processing unavailable');
        const notice = event.payment as unknown as {
          kind: 'REFUND' | 'DISPUTE';
          providerId: string;
        };
        await this.financial.processCase(notice.kind, notice.providerId);
      } else if (event.eventType.startsWith('transfer.')) {
        if (!this.payouts) throw new Error('Payout processing unavailable');
        const payout = await this.payouts.verify(
          event.reference ?? '',
          undefined,
          event.payment as unknown as TransferNotice,
        );
        if (!['SUCCESS', 'FAILED', 'REVERSED'].includes(payout.status))
          throw new Error('Transfer outcome pending');
      } else {
        const payment = event.payment as unknown as PaystackPayment;
        const request = await this.confirmation.confirm(event.reference ?? '', undefined, payment);
        if (request.status !== 'SUCCESS') throw new Error('Payment not yet successful');
      }
      await this.prisma.paystackEvent.update({
        where: { id },
        data: { status: 'PROCESSED', processedAt: new Date(), lockedUntil: null, lastError: null },
      });
    } catch (error) {
      const rejected = error instanceof ConflictException || error instanceof NotFoundException;
      await this.prisma.paystackEvent.update({
        where: { id },
        data: {
          status: rejected ? 'REJECTED' : 'RECEIVED',
          lockedUntil: null,
          processedAt: rejected ? new Date() : null,
          lastError: rejected
            ? 'Payment mismatch, unknown funding request, or wallet requires reconciliation'
            : 'Verification temporarily unavailable; retry scheduled',
          nextAttemptAt: new Date(
            Date.now() + Math.min(3600_000, 30_000 * 2 ** Math.min(event.attempts, 7)),
          ),
        },
      });
    }
  }
}
