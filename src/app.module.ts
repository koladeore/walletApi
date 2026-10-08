import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { validateEnvironment } from './config/environment';
import { LoggerModule } from 'nestjs-pino';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
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
    ThrottlerModule.forRoot([
      {
        ttl: 60000,
        limit: 10,
      },
    ]),
  ],
  controllers: [AppController],
  providers: [
    AppService,
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule {}
