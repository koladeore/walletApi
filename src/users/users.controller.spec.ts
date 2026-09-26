import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PassportModule } from '@nestjs/passport';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import request from 'supertest';
import type { App } from 'supertest/types';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';
import { JwtStrategy } from '../auth/strategies/jwt.strategy';

describe('User route access', () => {
  let app: INestApplication<App>;
  const jwt = new JwtService({ secret: 'test-only-role-secret' });
  const id = 'a90a209b-6e03-4eab-9e06-a38248aa6f27';
  const profile = { id, email: 'user@example.com', firstName: 'Test', lastName: 'User' };
  const users = {
    findById: jest.fn(),
    getProfile: jest.fn(),
    getAllUsers: jest.fn(),
    getWallet: jest.fn(),
    lookupRecipient: jest.fn(),
  };
  const token = (sub: string, role = 'USER') => jwt.sign({ sub, role });

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      imports: [PassportModule],
      controllers: [UsersController],
      providers: [
        JwtStrategy,
        { provide: UsersService, useValue: users },
        { provide: ConfigService, useValue: { getOrThrow: () => 'test-only-role-secret' } },
      ],
    }).compile();
    app = module.createNestApplication<INestApplication<App>>();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
    );
    await app.init();
  });
  beforeEach(() => {
    jest.resetAllMocks();
    users.findById.mockImplementation((sub: string) =>
      Promise.resolve({
        ...profile,
        role: sub === 'admin' ? 'ADMIN' : 'USER',
        isActive: sub !== 'inactive',
      }),
    );
    users.getProfile.mockResolvedValue(profile);
    users.getAllUsers.mockResolvedValue([profile]);
    users.getWallet.mockResolvedValue({ balance: '0' });
    users.lookupRecipient.mockResolvedValue({ id, firstName: 'Test', lastName: 'User' });
  });
  afterAll(async () => {
    await app.close();
  });

  it.each(['/users', `/users/${id}`, '/users/profile', '/users/wallet'])(
    'rejects unauthenticated GET %s',
    async (path) => {
      await request(app.getHttpServer()).get(`/api/v1${path}`).expect(401);
    },
  );
  it.each(['/users', `/users/${id}`])(
    'denies ordinary users even with an ADMIN token claim: %s',
    async (path) => {
      await request(app.getHttpServer())
        .get(`/api/v1${path}`)
        .auth(token('user', 'ADMIN'), { type: 'bearer' })
        .expect(403);
      expect(users.getProfile).not.toHaveBeenCalled();
      expect(users.getAllUsers).not.toHaveBeenCalled();
    },
  );
  it.each(['/users', `/users/${id}`])('allows database admins: %s', async (path) => {
    await request(app.getHttpServer())
      .get(`/api/v1${path}`)
      .auth(token('admin'), { type: 'bearer' })
      .expect(200);
  });
  it.each(['/users/profile', '/users/wallet'])(
    'keeps self-service access for users: %s',
    async (path) => {
      await request(app.getHttpServer())
        .get(`/api/v1${path}`)
        .auth(token('user'), { type: 'bearer' })
        .expect(200);
    },
  );
  it('blocks inactive accounts', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/users')
      .auth(token('inactive'), { type: 'bearer' })
      .expect(401);
  });
  it('requires login for recipient lookup', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/users/recipient-lookup')
      .send({ email: profile.email })
      .expect(401);
  });
  it('returns only recipient ID and names', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/users/recipient-lookup')
      .auth(token('user'), { type: 'bearer' })
      .send({ email: profile.email })
      .expect(200, { id, firstName: 'Test', lastName: 'User' });
  });
  it('validates exact email lookup input', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/users/recipient-lookup')
      .auth(token('user'), { type: 'bearer' })
      .send({ email: 'test' })
      .expect(400);
    expect(users.lookupRecipient).not.toHaveBeenCalled();
  });
  it('returns 404 for an unavailable recipient', async () => {
    users.lookupRecipient.mockResolvedValue(null);
    await request(app.getHttpServer())
      .post('/api/v1/users/recipient-lookup')
      .auth(token('user'), { type: 'bearer' })
      .send({ email: profile.email })
      .expect(404);
  });
});
