import { ConfigService } from '@nestjs/config';
import { SecurityDeliveryService } from './delivery.service';
import { PrismaService } from '../prisma/prisma.service';
import { encryptDelivery } from './crypto';

describe('Authentication delivery', () => {
  const secret = 'test-security-6f0d31e247a95681';
  const prisma = {
    securityDelivery: { updateMany: jest.fn(), findUniqueOrThrow: jest.fn(), update: jest.fn() },
    securityChallenge: { findUnique: jest.fn() },
    user: { findUnique: jest.fn() },
  };
  let fetchMock: jest.SpiedFunction<typeof fetch>;
  beforeEach(() => {
    jest.resetAllMocks();
    fetchMock = jest.spyOn(globalThis, 'fetch');
    prisma.securityDelivery.updateMany.mockResolvedValue({ count: 1 });
    prisma.securityChallenge.findUnique.mockResolvedValue({
      consumedAt: null,
      userId: 'user1',
      authVersion: 0,
    });
    prisma.user.findUnique.mockResolvedValue({ isActive: true, closedAt: null, authVersion: 0 });
    prisma.securityDelivery.findUniqueOrThrow.mockResolvedValue({
      id: 'challenge',
      channel: 'EMAIL',
      recipient: 'owner@example.com',
      payload: encryptDelivery(secret, {
        code: '123456',
        challengeId: 'challenge',
        summary: 'Verify email',
      }),
      expiresAt: new Date(Date.now() + 600000),
      attempts: 1,
    });
  });
  afterEach(() => jest.restoreAllMocks());
  const service = (settings: Record<string, string>) =>
    new SecurityDeliveryService(
      new ConfigService({ AUTH_SECURITY_SECRET: secret, ...settings }),
      prisma as unknown as PrismaService,
    );
  it('rejects test delivery when running in production', () => {
    expect(() =>
      service({ NODE_ENV: 'production', AUTH_DELIVERY_MODE: 'test' }).assertAvailable('EMAIL'),
    ).toThrow();
  });
  it('sends provider email over HTTPS and removes encrypted content after success', async () => {
    fetchMock.mockResolvedValue(new Response('{}', { status: 200 }));
    await service({
      AUTH_DELIVERY_MODE: 'provider',
      RESEND_API_KEY: 're_test',
      AUTH_EMAIL_FROM: 'security@example.com',
    }).process('challenge');
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.resend.com/emails',
      expect.objectContaining({
        method: 'POST',
        redirect: 'error',
        headers: {
          Authorization: 'Bearer re_test',
          'Content-Type': 'application/json',
          'Idempotency-Key': 'security-challenge',
        },
      }),
    );
    expect(prisma.securityDelivery.update).toHaveBeenCalledWith({
      where: { id: 'challenge' },
      data: { status: 'SENT', payload: null, lockedUntil: null },
    });
  });
  it('expires messages without sending stale codes', async () => {
    prisma.securityChallenge.findUnique.mockResolvedValue({ consumedAt: new Date() });
    await service({ AUTH_DELIVERY_MODE: 'provider' }).process('challenge');
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it('does not send codes after the account authorization version changes', async () => {
    prisma.user.findUnique.mockResolvedValue({ isActive: true, closedAt: null, authVersion: 1 });
    await service({
      AUTH_DELIVERY_MODE: 'provider',
      RESEND_API_KEY: 're_test',
      AUTH_EMAIL_FROM: 'security@example.com',
    }).process('challenge');
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it('schedules failures without persisting provider errors or logging codes', async () => {
    fetchMock.mockRejectedValue(new Error('private 123456 re_test'));
    await service({
      AUTH_DELIVERY_MODE: 'provider',
      RESEND_API_KEY: 're_test',
      AUTH_EMAIL_FROM: 'security@example.com',
    }).process('challenge');
    expect(prisma.securityDelivery.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'PENDING', lockedUntil: null }) as object,
      }),
    );
  });
});
