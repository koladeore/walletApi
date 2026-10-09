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
  const app = await NestFactory.create(AppModule, { bufferLogs: true, rawBody: true });

  // Use nestjs-pino logger
  app.useLogger(app.get(Logger));

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
  await app.listen(port);
  console.log(`Application is running on: http://localhost:${port}/api/v1`);
  console.log(`Swagger UI is available at: http://localhost:${port}/api/docs`);
}
void bootstrap();
