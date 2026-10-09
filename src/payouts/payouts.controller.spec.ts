import { Test } from '@nestjs/testing';
import { UnauthorizedException, ValidationPipe } from '@nestjs/common';
import type { INestApplication, ExecutionContext } from '@nestjs/common';
import type { Server } from 'node:http';
import request from 'supertest';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PayoutsController } from './payouts.controller';
import { PayoutsService } from './payouts.service';

describe('Payout HTTP boundary', () => {
  let app: INestApplication<Server>;
  const service = { create: jest.fn(), get: jest.fn(), list: jest.fn(), verify: jest.fn() };
  const beneficiaryId = '4d1d3e04-3229-4d88-9e4a-8507b53c73b1';
  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [PayoutsController],
      providers: [{ provide: PayoutsService, useValue: service }],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({
        canActivate: (ctx: ExecutionContext) => {
          const req = ctx
            .switchToHttp()
            .getRequest<{ headers: { authorization?: string }; user?: { id: string } }>();
          if (req.headers.authorization !== 'Bearer test-user') throw new UnauthorizedException();
          req.user = { id: 'user1' };
          return true;
        },
      })
      .compile();
    app = module.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
        transformOptions: { enableImplicitConversion: true },
      }),
    );
    await app.init();
  });
  beforeEach(() => jest.resetAllMocks());
  afterAll(async () => {
    await app.close();
  });
  it('requires authentication before creating payouts', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/wallet/payouts')
      .send({ beneficiaryId, amount: '100' })
      .expect(401);
    expect(service.create).not.toHaveBeenCalled();
  });
  it('uses authenticated ownership and forwards the idempotency key', async () => {
    service.create.mockResolvedValue({ status: 'PROCESSING' });
    await request(app.getHttpServer())
      .post('/api/v1/wallet/payouts')
      .auth('test-user', { type: 'bearer' })
      .set('x-idempotency-key', 'same-request')
      .send({ beneficiaryId, amount: '100.50' })
      .expect(201);
    expect(service.create).toHaveBeenCalledWith('user1', beneficiaryId, '100.50', 'same-request');
  });
  it.each([
    { beneficiaryId, amount: 100 },
    { beneficiaryId: 'bad', amount: '100' },
    { beneficiaryId, amount: '100', reference: 'client-reference' },
    { beneficiaryId, amount: '100', userId: 'other' },
  ])('rejects malformed or client-controlled payout fields %j', async (body) => {
    await request(app.getHttpServer())
      .post('/api/v1/wallet/payouts')
      .auth('test-user', { type: 'bearer' })
      .send(body)
      .expect(400);
    expect(service.create).not.toHaveBeenCalled();
  });
  it('restricts verification to authenticated owner', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/wallet/payouts/payout-test/verify')
      .auth('test-user', { type: 'bearer' })
      .expect(200);
    expect(service.verify).toHaveBeenCalledWith('payout-test', 'user1');
  });
});
