import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { ReconciliationService } from './reconciliation.service';
import { FinancialService } from './financial.service';

@Injectable()
export class OperationsWorker implements OnModuleInit, OnModuleDestroy {
  private timer?: NodeJS.Timeout;
  private running = false;
  private readonly logger = new Logger(OperationsWorker.name);
  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
    private readonly reconciliation: ReconciliationService,
    private readonly financial: FinancialService,
  ) {}
  onModuleInit() {
    if (this.config.get<string>('PAYSTACK_ENABLED') === 'true') {
      this.timer = setInterval(() => {
        void this.tick();
      }, 15 * 60_000);
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
      const cases = await this.prisma.financialCase.findMany({
        where: { applied: false, nextCheckAt: { lte: new Date() } },
        orderBy: { nextCheckAt: 'asc' },
        take: 50,
      });
      for (const item of cases)
        try {
          await this.financial.processCase(item.kind as 'REFUND' | 'DISPUTE', item.providerId);
        } catch {
          this.logger.warn('Financial case needs another provider check or investigation');
        }
      await this.reconciliation.run();
    } catch {
      this.logger.warn('Financial reconciliation unavailable or already running');
    } finally {
      this.running = false;
    }
  }
}
