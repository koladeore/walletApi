import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { SecurityDeliveryService } from './delivery.service';

@Injectable()
export class SecurityWorker implements OnModuleInit, OnModuleDestroy {
  private timer?: NodeJS.Timeout;
  private running = false;
  private readonly logger = new Logger(SecurityWorker.name);
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly delivery: SecurityDeliveryService,
  ) {}
  onModuleInit() {
    if (this.config.get<string>('AUTH_DELIVERY_MODE') === 'provider') {
      this.timer = setInterval(() => {
        void this.tick();
      }, 5000);
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
      await this.prisma.securityDelivery.updateMany({
        where: { expiresAt: { lt: new Date() }, payload: { not: null } },
        data: { payload: null, status: 'EXPIRED' },
      });
      const now = new Date();
      const due = await this.prisma.securityDelivery.findMany({
        where: {
          status: 'PENDING',
          nextAttemptAt: { lte: now },
          OR: [{ lockedUntil: null }, { lockedUntil: { lt: now } }],
        },
        orderBy: { nextAttemptAt: 'asc' },
        take: 10,
      });
      for (const message of due) await this.delivery.process(message.id);
    } catch {
      this.logger.error('Authentication delivery worker unavailable; will retry');
    } finally {
      this.running = false;
    }
  }
}
