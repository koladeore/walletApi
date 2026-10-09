import { StepUpGuard } from '../security/step-up.guard';
import { Test } from '@nestjs/testing';
import { UnauthorizedException, ValidationPipe } from '@nestjs/common';
import type { INestApplication, ExecutionContext } from '@nestjs/common';
import type { Server } from 'node:http';
import request from 'supertest';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { OperationsController } from './operations.controller';
import { ReconciliationService } from './reconciliation.service';
import { PrismaService } from '../prisma/prisma.service';

describe('Financial operations access', () => {
  let app: INestApplication<Server>;
  const reconcile = jest.fn();
  const read = jest.fn();
  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [OperationsController],
      providers: [
        { provide: ReconciliationService, useValue: { run: reconcile } },
        {
          provide: PrismaService,
          useValue: {
            reconciliationRun: { findMany: read },
            reconciliationIssue: { findMany: read },
            financialCase: { findMany: read },
          },
        },
      ],
    })
      .overrideGuard(StepUpGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(JwtAuthGuard)
      .useValue({
        canActivate: (ctx: ExecutionContext) => {
          const req = ctx.switchToHttp().getRequest<{
            headers: { authorization?: string };
            user?: { id: string; role: string };
          }>();
          if (!req.headers.authorization) throw new UnauthorizedException();
          req.user = {
            id: 'actor',
            role: req.headers.authorization === 'Bearer admin' ? 'ADMIN' : 'USER',
          };
          return true;
        },
      })
      .compile();
    app = module.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
    );
    await app.init();
  });
  afterAll(async () => {
    await app.close();
  });
  beforeEach(() => jest.resetAllMocks());
  it('denies unauthenticated reconciliation', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/admin/financial-operations/reconcile')
      .expect(401);
    expect(reconcile).not.toHaveBeenCalled();
  });
  it('denies ordinary users reconciliation and findings access', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/admin/financial-operations/reconcile')
      .auth('user', { type: 'bearer' })
      .expect(403);
    await request(app.getHttpServer())
      .get('/api/v1/admin/financial-operations/issues')
      .auth('user', { type: 'bearer' })
      .expect(403);
    expect(reconcile).not.toHaveBeenCalled();
    expect(read).not.toHaveBeenCalled();
  });
  it('allows an administrator to reconcile', async () => {
    reconcile.mockResolvedValue({ status: 'DIFFERENCES' });
    await request(app.getHttpServer())
      .post('/api/v1/admin/financial-operations/reconcile')
      .auth('admin', { type: 'bearer' })
      .expect(201);
    expect(reconcile).toHaveBeenCalledTimes(1);
  });
  it('requires a meaningful investigation note', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/admin/financial-operations/issues/issue/resolve')
      .auth('admin', { type: 'bearer' })
      .send({ reason: 'ok' })
      .expect(400);
  });
});
