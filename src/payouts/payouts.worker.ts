import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { PayoutsService } from './payouts.service';

@Injectable()
export class PayoutsWorker implements OnModuleInit, OnModuleDestroy {
  private timer?: NodeJS.Timeout;
  private running = false;
  private readonly logger = new Logger(PayoutsWorker.name);
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly payouts: PayoutsService,
  ) {}
  onModuleInit() {
    if (this.config.get<string>('PAYSTACK_ENABLED') === 'true') {
      this.timer = setInterval(() => {
        void this.tick();
      }, 30_000);
      this.timer.unref();
    }
  }
  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }
  async tick() {
    if (this.running) return;
    this.running = true;
    try {
      const now = new Date();
      const due = await this.prisma.payout.findMany({
        where: {
          status: { in: ['PENDING', 'PROCESSING', 'SUCCESS'] },
          nextCheckAt: { lte: now },
          OR: [{ lockedUntil: null }, { lockedUntil: { lt: now } }],
        },
        orderBy: { nextCheckAt: 'asc' },
        take: 10,
      });
      for (const payout of due) {
        try {
          if (!payout.submittedAt) await this.payouts.dispatch(payout.reference);
          else {
            const claim = await this.prisma.payout.updateMany({
              where: { id: payout.id, nextCheckAt: { lte: now } },
              data: {
                nextCheckAt: new Date(
                  Date.now() + (payout.status === 'SUCCESS' ? 3600_000 : 60_000),
                ),
              },
            });
            if (claim.count) await this.payouts.verify(payout.reference);
          }
        } catch {
          this.logger.warn('Payout requires later verification or reconciliation');
        }
      }
    } catch {
      this.logger.error('Payout background check failed; will retry');
    } finally {
      this.running = false;
    }
  }
}
