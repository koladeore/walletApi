import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { WebhookService } from './webhook.service';
import { ConfirmationService } from './confirmation.service';

@Injectable()
export class FundingWorker implements OnModuleInit, OnModuleDestroy {
  private timer?: NodeJS.Timeout;
  private running = false;
  private readonly logger = new Logger(FundingWorker.name);
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly webhook: WebhookService,
    private readonly confirmation: ConfirmationService,
  ) {}

  onModuleInit() {
    if (this.config.get<string>('PAYSTACK_ENABLED') !== 'true') return;
    this.timer = setInterval(() => {
      void this.tick();
    }, 30_000);
    this.timer.unref();
  }
  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  async tick(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      const now = new Date();
      const events = await this.prisma.paystackEvent.findMany({
        where: {
          status: 'RECEIVED',
          nextAttemptAt: { lte: now },
          OR: [{ lockedUntil: null }, { lockedUntil: { lt: now } }],
        },
        orderBy: { nextAttemptAt: 'asc' },
        take: 10,
      });
      for (const event of events) await this.webhook.process(event.id);
      const cutoff = new Date(Date.now() - 60_000);
      const pending = await this.prisma.fundingRequest.findMany({
        where: {
          status: { in: ['INITIALIZING', 'INITIALIZATION_UNKNOWN', 'PENDING'] },
          createdAt: { lt: cutoff },
          OR: [{ lastCheckedAt: null }, { lastCheckedAt: { lt: cutoff } }],
        },
        orderBy: [{ lastCheckedAt: { sort: 'asc', nulls: 'first' } }, { createdAt: 'asc' }],
        take: 10,
      });
      for (const request of pending) {
        // Claim a check time atomically; other replicas skip it for a minute.
        const claim = await this.prisma.fundingRequest.updateMany({
          where: {
            id: request.id,
            status: { not: 'SUCCESS' },
            OR: [{ lastCheckedAt: null }, { lastCheckedAt: { lt: cutoff } }],
          },
          data: { lastCheckedAt: new Date() },
        });
        if (!claim.count) continue;
        try {
          await this.confirmation.confirm(request.reference);
        } catch {
          this.logger.warn('Pending funding requires another verification or reconciliation');
        }
      }
    } catch {
      this.logger.error('Funding background check failed; will retry');
    } finally {
      this.running = false;
    }
  }
}
