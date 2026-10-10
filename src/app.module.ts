import { apiEnabled } from './config/runtime-mode';
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { validateEnvironment } from './config/environment';
import { LoggerModule } from 'nestjs-pino';
import { SharedRateLimitGuard } from './rate-limit/shared-rate-limit.guard';
import { APP_GUARD } from '@nestjs/core';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { WalletModule } from './wallet/wallet.module';
import { BullModule } from '@nestjs/bullmq';
import { EmailModule } from './email/email.module';
import { NotificationModule } from './notification/notification.module';
import { PaystackModule } from './paystack/paystack.module';
import { FundingModule } from './funding/funding.module';
import { BeneficiariesModule } from './beneficiaries/beneficiaries.module';

function prettyLogTarget(): string | undefined {
  if (process.env.NODE_ENV === 'production') return undefined;

  try {
    return require.resolve('pino-pretty');
  } catch {
    // The slim Docker image omits devDependencies, even when run in development mode.
    // Keep standard JSON logging available without the optional formatter.
    return undefined;
  }
}

const prettyTarget = prettyLogTarget();

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate: validateEnvironment,
    }),
    LoggerModule.forRoot({
      pinoHttp: {
        redact: [
          'req.headers.authorization',
          'req.headers.cookie',
          'req.headers["x-step-up-token"]',
          'req.body.password',
          'req.body.newPassword',
          'req.body.code',
          'req.body.refreshToken',
          'req.body.details',
        ],
        customProps: () => ({
          context: 'HTTP',
        }),
        transport: prettyTarget
          ? {
              target: prettyTarget,
              options: {
                singleLine: true,
              },
            }
          : undefined,
      },
    }),
    PrismaModule,
    AuthModule,
    UsersModule,
    WalletModule,
    PaystackModule,
    FundingModule,
    BeneficiariesModule,
    EmailModule,
    NotificationModule,
    BullModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        connection: {
          host: config.getOrThrow<string>('REDIS_HOST'),
          port: config.getOrThrow<number>('REDIS_PORT'),
        },
      }),
    }),
  ],
  controllers: [AppController],
  providers: [
    AppService,
    ...(apiEnabled() ? [{ provide: APP_GUARD, useClass: SharedRateLimitGuard }] : []),
  ],
})
export class AppModule {}
