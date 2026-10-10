import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { ConfigService } from '@nestjs/config';
import { Pool } from 'pg';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  constructor(config: ConfigService) {
    const url = config.getOrThrow<string>('DATABASE_URL');
    const pool = new Pool({
      connectionString: url,
      max: config.get<number>('DB_POOL_MAX') ?? 10,
      connectionTimeoutMillis: config.get<number>('DB_CONNECTION_TIMEOUT_MS') ?? 5000,
      idleTimeoutMillis: config.get<number>('DB_IDLE_TIMEOUT_MS') ?? 30000,
      statement_timeout: config.get<number>('DB_STATEMENT_TIMEOUT_MS') ?? 15000,
      lock_timeout: config.get<number>('DB_LOCK_TIMEOUT_MS') ?? 5000,
      application_name: 'wallet-api',
    });
    // Prisma owns/disposes this external pool; do not leave idle connections behind.
    const adapter = new PrismaPg(pool, {
      disposeExternalPool: true,
      onPoolError: () => Logger.error('Database pool connection error', 'PrismaService'),
    });
    super({ adapter });
  }

  async onModuleInit() {
    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
