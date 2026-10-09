import { UnauthorizedException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import type { User } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { AuthService } from './auth.service';
import { UsersService } from '../users/users.service';
import { PrismaService } from '../prisma/prisma.service';
import { JwtStrategy } from './strategies/jwt.strategy';

describe('Account status enforcement', () => {
  let auth: AuthService;
  let strategy: JwtStrategy;
  let user: User;
  let refreshHash: string;
  const users = { findByEmail: jest.fn(), findById: jest.fn() };
  const jwt = { signAsync: jest.fn(), verifyAsync: jest.fn() };
  const tokens = { create: jest.fn(), findMany: jest.fn(), update: jest.fn() };

  beforeAll(async () => {
    user = {
      id: 'user-id',
      email: 'test@example.com',
      firstName: 'Test',
      lastName: 'User',
      password: await bcrypt.hash('correct-password', 4),
      isActive: true,
      role: 'USER',
      authVersion: 0,
      closedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    refreshHash = await bcrypt.hash('valid-refresh-token', 4);
  });

  beforeEach(async () => {
    jest.resetAllMocks();
    users.findByEmail.mockResolvedValue(user);
    users.findById.mockResolvedValue(user);
    jwt.verifyAsync.mockResolvedValue({ sub: user.id, email: user.email });
    jwt.signAsync.mockResolvedValue('new-token');
    tokens.findMany.mockResolvedValue([{ id: 'session-id', token: refreshHash }]);
    tokens.create.mockResolvedValue({});
    tokens.update.mockResolvedValue({});
    const module = await Test.createTestingModule({
      providers: [
        AuthService,
        JwtStrategy,
        { provide: UsersService, useValue: users },
        { provide: JwtService, useValue: jwt },
        { provide: PrismaService, useValue: { authToken: tokens } },
        {
          provide: ConfigService,
          useValue: {
            get: () => 'test-value',
            getOrThrow: (key: string) => (key === 'REFRESH_EXPIRES_IN' ? 604800 : 'test-secret'),
          },
        },
      ],
    }).compile();
    auth = module.get(AuthService);
    strategy = module.get(JwtStrategy);
  });

  it('rejects inactive login even with the correct password, without issuing tokens', async () => {
    users.findByEmail.mockResolvedValue({ ...user, isActive: false });
    await expect(auth.login({ email: user.email, password: 'correct-password' })).rejects.toThrow(
      'Invalid credentials',
    );
    expect(jwt.signAsync).not.toHaveBeenCalled();
    expect(tokens.create).not.toHaveBeenCalled();
  });

  it('rejects refresh for an inactive user even with a valid refresh token', async () => {
    users.findById.mockResolvedValue({ ...user, isActive: false });
    await expect(auth.refreshTokens('valid-refresh-token')).rejects.toThrow(
      'Invalid refresh token',
    );
    expect(tokens.findMany).not.toHaveBeenCalled();
    expect(tokens.update).not.toHaveBeenCalled();
    expect(tokens.create).not.toHaveBeenCalled();
    expect(jwt.signAsync).not.toHaveBeenCalled();
  });

  it('blocks direct token generation for inactive users', async () => {
    await expect(auth.generateTokens({ ...user, isActive: false })).rejects.toThrow(
      UnauthorizedException,
    );
    expect(jwt.signAsync).not.toHaveBeenCalled();
    expect(tokens.create).not.toHaveBeenCalled();
  });

  it('rechecks database status on requests using a previously valid token', async () => {
    const payload = { sub: user.id, email: user.email };
    await expect(strategy.validate(payload)).resolves.toEqual(user);
    users.findById.mockResolvedValue({ ...user, isActive: false });
    await expect(strategy.validate(payload)).rejects.toThrow(UnauthorizedException);
  });

  it('rejects deleted accounts on authenticated requests', async () => {
    users.findById.mockResolvedValue(null);
    await expect(strategy.validate({ sub: user.id, email: user.email })).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('allows active users to log in', async () => {
    const result = await auth.login({ email: user.email, password: 'correct-password' });
    expect(result.accessToken).toBe('new-token');
    expect(jwt.signAsync).toHaveBeenCalledTimes(2);
    expect(tokens.create).toHaveBeenCalledTimes(1);
  });

  it('allows active users to refresh', async () => {
    const result = await auth.refreshTokens('valid-refresh-token');
    expect(result.accessToken).toBe('new-token');
    expect(tokens.update).toHaveBeenCalledWith({
      where: { id: 'session-id' },
      data: { isRevoked: true },
    });
    expect(tokens.create).toHaveBeenCalledTimes(1);
  });

  it('still rejects incorrect passwords', async () => {
    await expect(auth.login({ email: user.email, password: 'wrong-password' })).rejects.toThrow(
      'Invalid credentials',
    );
    expect(jwt.signAsync).not.toHaveBeenCalled();
  });
  it('rejects access tokens issued before reactivation', async () => {
    users.findById.mockResolvedValue({ ...user, authVersion: 2 });
    await expect(strategy.validate({ sub: user.id, email: user.email })).rejects.toThrow(
      UnauthorizedException,
    );
    await expect(
      strategy.validate({ sub: user.id, email: user.email, authVersion: 2 }),
    ).resolves.toHaveProperty('id', user.id);
  });

  it('rejects refresh tokens issued before a status change', async () => {
    users.findById.mockResolvedValue({ ...user, authVersion: 2 });
    await expect(auth.refreshTokens('valid-refresh-token')).rejects.toThrow(UnauthorizedException);
    expect(jwt.signAsync).not.toHaveBeenCalled();
  });
  it('does not let a pre-reset refresh token revoke a new session through logout', async () => {
    users.findById.mockResolvedValue({ ...user, authVersion: 2 });
    await auth.logout('valid-refresh-token');
    expect(tokens.findMany).not.toHaveBeenCalled();
    expect(tokens.update).not.toHaveBeenCalled();
  });
  it.each(['USER', 'ADMIN'] as const)(
    'returns the database role %s on login and refresh',
    async (role) => {
      users.findByEmail.mockResolvedValue({ ...user, role });
      users.findById.mockResolvedValue({ ...user, role });
      const login = await auth.login({ email: user.email, password: 'correct-password' });
      const refresh = await auth.refreshTokens('valid-refresh-token');
      for (const result of [login, refresh]) {
        expect(result.user).toEqual({
          id: user.id,
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
          role,
        });
        expect(result.user).not.toHaveProperty('password');
        expect(result.user).not.toHaveProperty('authVersion');
      }
    },
  );
});
