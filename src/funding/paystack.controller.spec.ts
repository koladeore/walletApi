import { createHmac } from 'node:crypto';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import request from 'supertest';
import type { Server } from 'node:http';
import { PaystackController } from './paystack.controller';
import { WebhookService } from './webhook.service';
import { PaystackService } from '../paystack/paystack.service';
import { PrismaService } from '../prisma/prisma.service';
import { ConfirmationService } from './confirmation.service';

describe('Paystack HTTP webhook', () => {
  let app: INestApplication<Server>;
  const persist = jest.fn();
  const key = 'sk_test_example123';
  const raw =
    '{ "event": "charge.success", "data": { "id":123,"reference":"fund-test","amount":10050,"currency":"NGN","domain":"test","status":"success","customer":{"email":"owner@example.com"} } }';
  const sign = (body: string) => createHmac('sha512', key).update(body).digest('hex');
  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [PaystackController],
      providers: [
        WebhookService,
        PaystackService,
        {
          provide: ConfigService,
          useValue: new ConfigService({ PAYSTACK_ENABLED: 'true', PAYSTACK_SECRET_KEY: key }),
        },
        { provide: PrismaService, useValue: { paystackEvent: { createMany: persist } } },
        { provide: ConfirmationService, useValue: {} },
      ],
    }).compile();
    app = module.createNestApplication({ rawBody: true });
    app.setGlobalPrefix('api/v1');
    await app.init();
  });
  afterAll(async () => {
    await app.close();
  });
  beforeEach(() => persist.mockReset());

  it('accepts and persists raw signed JSON including whitespace', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/paystack/webhook')
      .set('Content-Type', 'application/json')
      .set('x-paystack-signature', sign(raw))
      .send(raw)
      .expect(200)
      .expect({ received: true });
    expect(persist).toHaveBeenCalledTimes(1);
  });
  it('rejects absent signatures before persistence', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/paystack/webhook')
      .set('Content-Type', 'application/json')
      .send(raw)
      .expect(401);
    expect(persist).not.toHaveBeenCalled();
  });
  it('rejects altered raw bytes even when the parsed JSON is unchanged', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/paystack/webhook')
      .set('Content-Type', 'application/json')
      .set('x-paystack-signature', sign(raw))
      .send(raw + ' ')
      .expect(401);
    expect(persist).not.toHaveBeenCalled();
  });
  it('does not acknowledge an event when durable persistence fails', async () => {
    persist.mockRejectedValue(new Error('Database unavailable'));
    await request(app.getHttpServer())
      .post('/api/v1/paystack/webhook')
      .set('Content-Type', 'application/json')
      .set('x-paystack-signature', sign(raw))
      .send(raw)
      .expect(500);
  });
  it('callback is informational and performs no money operations', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/paystack/callback?reference=fund-test')
      .expect(200);
    expect(persist).not.toHaveBeenCalled();
  });
});
