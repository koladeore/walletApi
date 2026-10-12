import { apiEnabled } from './config/runtime-mode';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { NestFactory, HttpAdapterHost } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import { Logger } from 'nestjs-pino';
import helmet from 'helmet';
import compression from 'compression';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import { documentFrontendApi } from './documentation/swagger';

async function bootstrap() {
  if (!apiEnabled()) {
    const context = await NestFactory.createApplicationContext(AppModule, { bufferLogs: true });
    context.useLogger(context.get(Logger));
    context.enableShutdownHooks();
    console.log('Worker process started; no HTTP port is opened.');
    return;
  }
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bufferLogs: true,
    rawBody: true,
  });

  app.enableShutdownHooks();

  const origins = (app.get(ConfigService).get<string>('CORS_ORIGINS') ?? '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
  if (origins.length)
    app.enableCors({
      origin: origins,
      credentials: false,
      methods: ['GET', 'HEAD', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Authorization', 'Content-Type', 'x-idempotency-key', 'x-step-up-token'],
      exposedHeaders: [
        'Retry-After',
        'X-RateLimit-Policy',
        'X-RateLimit-Remaining',
        'X-RateLimit-Reset',
        'X-RateLimit-Limit-IP',
        'X-RateLimit-Limit-Account',
      ],
      maxAge: 600,
    });

  // Use nestjs-pino logger
  app.useLogger(app.get(Logger));

  const trustedProxies = (app.get(ConfigService).get<string>('TRUST_PROXY_IPS') ?? '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
  app.set('trust proxy', trustedProxies.length ? trustedProxies : false);

  // Security & Optimization
  app.use(helmet());
  app.use(compression());

  // Global Prefix
  app.setGlobalPrefix('api/v1');

  // Global Validation
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: {
        enableImplicitConversion: true,
      },
    }),
  );

  // Global Exception Filter
  const httpAdapterHost = app.get(HttpAdapterHost);
  app.useGlobalFilters(new AllExceptionsFilter(httpAdapterHost));

  // Swagger setup
  const config = new DocumentBuilder()
    .setTitle('Wallet API')
    .setDescription(
      `All routes use /api/v1. Authorize with the accessToken from login; refreshToken is used only for refresh/logout. Dates are UTC ISO 8601. Money and minor units are strings; use decimal-safe arithmetic.

Shared Redis fixed-window rate policies: login 10/IP and 5/account per minute; transfers/new payouts 20/IP and 10/account; reads 120/IP and 120/account; other writes 30/IP and 20/account (configurable). Inspect X-RateLimit-Policy/Remaining/Reset and Retry-After on 429. Redis outage fails closed with 503. Forwarded client IPs are trusted only from configured proxies.

Cursor lists return { data, meta: { limit, hasMore, nextCursor } }; default limit 20, maximum 100. Pass nextCursor unchanged to fetch older records. Transactions and notifications preserve legacy page mode; select mode=cursor for deep scrolling. Transaction limit is capped at 100 and legacy page at 1000.

Frontend flow: register → login → POST /auth/security/email/request → email/confirm. Registration sends a welcome email, not a verification code. A 201 code-request response means queued, not delivered. Codes last 10 minutes, allow five incorrect guesses, and are single-use. Requests have a 60-second per-purpose cooldown and a 10-request/account/hour limit.

Sensitive actions: request step-up with current password, action and exact details → confirm email code → send returned proof in x-step-up-token. Proof lasts five minutes and is consumed once, including when the action fails afterward. Keep the same financial x-idempotency-key on retries but obtain a fresh proof. See step-up/request examples for each action. Password reset invalidates old sessions; log in again. Each login has a separate sessionId. Refresh replaces both tokens atomically; serialize refresh across tabs because reuse revokes that session. Session expiry is fixed at login. GET /auth/sessions lists devices; selected logout and logout-all revoke access and refresh tokens.

Funding: initialize → open authorizationUrl → complete checkout → read stored status. Webhooks confirm automatically; verify is a fallback. Callback never credits money. Payout PENDING/PROCESSING reserves funds; SUCCESS captures, FAILED releases, REVERSED restores. uncertain=true means keep checking the existing reference; never create a replacement payout to resolve uncertainty.

Staff routes require ADMIN. Paystack webhook is provider-only. Error message can be a string or an object containing message (string or validation array); inspect statusCode and normalize for display.`,
    )
    .setVersion('1.0')
    .addBearerAuth()
    .build();
  const documentFactory = () => {
    const document = SwaggerModule.createDocument(app, config);
    documentFrontendApi(document);
    return document;
  };
  SwaggerModule.setup('api/docs', app, documentFactory);

  const port = app.get(ConfigService).getOrThrow<number>('PORT');
  await app.listen(port, '0.0.0.0');
  console.log(`Application is running on: http://localhost:${port}/api/v1`);
  console.log(`Swagger UI is available at: http://localhost:${port}/api/docs`);
}
void bootstrap();
