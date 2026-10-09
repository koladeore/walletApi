"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const core_1 = require("@nestjs/core");
const app_module_1 = require("./app.module");
const common_1 = require("@nestjs/common");
const nestjs_pino_1 = require("nestjs-pino");
const helmet_1 = __importDefault(require("helmet"));
const compression_1 = __importDefault(require("compression"));
const all_exceptions_filter_1 = require("./common/filters/all-exceptions.filter");
const swagger_1 = require("@nestjs/swagger");
const config_1 = require("@nestjs/config");
const swagger_2 = require("./documentation/swagger");
async function bootstrap() {
    const app = await core_1.NestFactory.create(app_module_1.AppModule, { bufferLogs: true, rawBody: true });
    app.useLogger(app.get(nestjs_pino_1.Logger));
    app.use((0, helmet_1.default)());
    app.use((0, compression_1.default)());
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new common_1.ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
        transformOptions: {
            enableImplicitConversion: true,
        },
    }));
    const httpAdapterHost = app.get(core_1.HttpAdapterHost);
    app.useGlobalFilters(new all_exceptions_filter_1.AllExceptionsFilter(httpAdapterHost));
    const config = new swagger_1.DocumentBuilder()
        .setTitle('Wallet API')
        .setDescription(`All routes use /api/v1. Authorize with the accessToken from login; refreshToken is used only for refresh/logout. Dates are UTC ISO 8601. Money and minor units are strings; use decimal-safe arithmetic.

Frontend flow: register → login → POST /auth/security/email/request → email/confirm. Registration sends a welcome email, not a verification code. A 201 code-request response means queued, not delivered. Codes last 10 minutes, allow five incorrect guesses, and are single-use. Requests have a 60-second per-purpose cooldown and a 10-request/account/hour limit.

Sensitive actions: request step-up with current password, action and exact details → confirm email code → send returned proof in x-step-up-token. Proof lasts five minutes and is consumed once, including when the action fails afterward. Keep the same financial x-idempotency-key on retries but obtain a fresh proof. See step-up/request examples for each action. Password reset invalidates old sessions; log in again.

Funding: initialize → open authorizationUrl → complete checkout → read stored status. Webhooks confirm automatically; verify is a fallback. Callback never credits money. Payout PENDING/PROCESSING reserves funds; SUCCESS captures, FAILED releases, REVERSED restores. uncertain=true means keep checking the existing reference; never create a replacement payout to resolve uncertainty.

Staff routes require ADMIN. Paystack webhook is provider-only. Error message can be a string or an object containing message (string or validation array); inspect statusCode and normalize for display.`)
        .setVersion('1.0')
        .addBearerAuth()
        .build();
    const documentFactory = () => {
        const document = swagger_1.SwaggerModule.createDocument(app, config);
        (0, swagger_2.documentFrontendApi)(document);
        return document;
    };
    swagger_1.SwaggerModule.setup('api/docs', app, documentFactory);
    const port = app.get(config_1.ConfigService).getOrThrow('PORT');
    await app.listen(port);
    console.log(`Application is running on: http://localhost:${port}/api/v1`);
    console.log(`Swagger UI is available at: http://localhost:${port}/api/docs`);
}
void bootstrap();
//# sourceMappingURL=main.js.map