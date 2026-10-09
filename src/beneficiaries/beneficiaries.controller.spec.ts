import { Test } from '@nestjs/testing';
import { UnauthorizedException, ValidationPipe } from '@nestjs/common';
import type { INestApplication, ExecutionContext } from '@nestjs/common';
import type { Server } from 'node:http';
import request from 'supertest';
import { BeneficiariesController } from './beneficiaries.controller';
import { BeneficiariesService } from './beneficiaries.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

describe('Beneficiary HTTP validation and authorization', () => {
  let app: INestApplication<Server>;
  const service = {
    create: jest.fn(),
    resolve: jest.fn(),
    banks: jest.fn(),
    list: jest.fn(),
    get: jest.fn(),
  };
  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [BeneficiariesController],
      providers: [{ provide: BeneficiariesService, useValue: service }],
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
  it('requires authentication', async () => {
    await request(app.getHttpServer()).get('/api/v1/beneficiaries').expect(401);
    expect(service.list).not.toHaveBeenCalled();
  });
  it('passes leading zeros and authenticated ownership when saving', async () => {
    service.create.mockResolvedValue({ id: 'saved' });
    await request(app.getHttpServer())
      .post('/api/v1/beneficiaries')
      .auth('test-user', { type: 'bearer' })
      .send({ bankCode: '058', accountNumber: '0001234567' })
      .expect(201);
    expect(service.create).toHaveBeenCalledWith('user1', {
      bankCode: '058',
      accountNumber: '0001234567',
    });
  });
  it.each([
    { bankCode: '058', accountNumber: 1234567890 },
    { bankCode: 58, accountNumber: '0001234567' },
    { bankCode: '058', accountNumber: '123' },
    { bankCode: '058', accountNumber: '0001234567', accountName: 'FORGED' },
    { bankCode: '058', accountNumber: '0001234567', userId: 'other-user' },
  ])('rejects malformed or client-controlled details %j', async (body) => {
    await request(app.getHttpServer())
      .post('/api/v1/beneficiaries')
      .auth('test-user', { type: 'bearer' })
      .send(body)
      .expect(400);
    expect(service.create).not.toHaveBeenCalled();
  });
  it('validates bank pagination', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/beneficiaries/banks?page=-1')
      .auth('test-user', { type: 'bearer' })
      .expect(400);
    expect(service.banks).not.toHaveBeenCalled();
  });
});
