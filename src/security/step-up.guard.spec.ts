import { Test } from '@nestjs/testing';
import { ForbiddenException, UnauthorizedException, ValidationPipe } from '@nestjs/common';
import type { ExecutionContext, INestApplication } from '@nestjs/common';
import type { Server } from 'node:http';
import request from 'supertest';
import { SecurityService } from './security.service';
import { StepUpGuard } from './step-up.guard';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PayoutsController } from '../payouts/payouts.controller';
import { PayoutsService } from '../payouts/payouts.service';
import { SecurityController } from './security.controller';

describe('Sensitive action HTTP protection', () => {
  let app: INestApplication<Server>;
  const authorize = jest.fn();
  const create = jest.fn();
  const reset = jest.fn();
  const step = jest.fn();
  const beneficiaryId = '4d1d3e04-3229-4d88-9e4a-8507b53c73b1';
  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [PayoutsController, SecurityController],
      providers: [
        StepUpGuard,
        {
          provide: SecurityService,
          useValue: { authorize, requestReset: reset, requestStepUp: step },
        },
        { provide: PayoutsService, useValue: { create } },
      ],
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
  afterAll(async () => {
    await app.close();
  });
  beforeEach(() => {
    jest.resetAllMocks();
    authorize.mockImplementation(
      (
        userId: string,
        token: string | undefined,
        action: string,
        details: Record<string, unknown>,
      ) => {
        if (
          userId !== 'user1' ||
          token !== 'valid-proof' ||
          action !== 'PAYOUT' ||
          details.beneficiaryId !== beneficiaryId ||
          details.amount !== '100.00'
        )
          throw new ForbiddenException('Fresh action-bound proof required');
        return Promise.resolve(7);
      },
    );
  });
  it('rejects payouts without a proof before money movement', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/wallet/payouts')
      .auth('test-user', { type: 'bearer' })
      .set('x-idempotency-key', 'key')
      .send({ beneficiaryId, amount: '100.00' })
      .expect(403);
    expect(create).not.toHaveBeenCalled();
  });
  it('checks the proof against actual request details and forwards its authorization version', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/wallet/payouts')
      .auth('test-user', { type: 'bearer' })
      .set('x-step-up-token', 'valid-proof')
      .set('x-idempotency-key', 'key')
      .send({ beneficiaryId, amount: '100.00' })
      .expect(201);
    expect(authorize).toHaveBeenCalledWith('user1', 'valid-proof', 'PAYOUT', {
      beneficiaryId,
      amount: '100.00',
    });
    expect(create).toHaveBeenCalledWith('user1', beneficiaryId, '100.00', 'key', 7);
  });
  it('cannot use a proof for a changed amount', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/wallet/payouts')
      .auth('test-user', { type: 'bearer' })
      .set('x-step-up-token', 'valid-proof')
      .send({ beneficiaryId, amount: '101.00' })
      .expect(403);
    expect(create).not.toHaveBeenCalled();
  });
  it('keeps recovery requests public and validates email input', async () => {
    reset.mockResolvedValue({ message: 'If eligible, a code will be delivered.' });
    await request(app.getHttpServer())
      .post('/api/v1/auth/security/password/request-reset')
      .send({ email: 'owner@example.com' })
      .expect(200);
    await request(app.getHttpServer())
      .post('/api/v1/auth/security/password/request-reset')
      .send({ email: 'invalid' })
      .expect(400);
  });
  it('does not implicitly convert a numeric current password into a string', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/auth/security/step-up/request')
      .auth('test-user', { type: 'bearer' })
      .send({ password: 12345678, action: 'PAYOUT', details: { beneficiaryId, amount: '100.00' } })
      .expect(400);
    expect(step).not.toHaveBeenCalled();
  });
});
