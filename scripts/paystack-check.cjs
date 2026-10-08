require('reflect-metadata');
const { Module } = require('@nestjs/common');
const { ConfigModule } = require('@nestjs/config');
const { NestFactory } = require('@nestjs/core');
const { validateEnvironment } = require('../dist/src/config/environment');
const { PaystackModule } = require('../dist/src/paystack/paystack.module');
const { PaystackService } = require('../dist/src/paystack/paystack.service');

class CheckModule {}
Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validate: validateEnvironment }),
    PaystackModule,
  ],
})(CheckModule);

(async () => {
  const app = await NestFactory.createApplicationContext(CheckModule, {
    logger: false,
    abortOnError: false,
  });
  try {
    await app.get(PaystackService).checkConnection();
    console.log('Paystack test connection verified.');
  } finally {
    await app.close();
  }
})().catch(() => {
  console.error(
    'Paystack test check failed. Check configuration, test credentials, and connectivity.',
  );
  process.exitCode = 1;
});
