import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { decryptDelivery } from './crypto';

@Injectable()
export class SecurityDeliveryService {
  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
  ) {}
  assertAvailable(channel: 'EMAIL') {
    const mode = this.config.get<string>('AUTH_DELIVERY_MODE');
    if (
      mode === 'test' &&
      ['development', 'test'].includes(this.config.get<string>('NODE_ENV') ?? '')
    )
      return;
    if (
      mode !== 'provider' ||
      channel !== 'EMAIL' ||
      !this.config.get('RESEND_API_KEY') ||
      !this.config.get('AUTH_EMAIL_FROM')
    )
      throw new ServiceUnavailableException('Authentication delivery is not configured');
  }
  async process(id: string) {
    const now = new Date();
    const claim = await this.prisma.securityDelivery.updateMany({
      where: {
        id,
        status: 'PENDING',
        nextAttemptAt: { lte: now },
        OR: [{ lockedUntil: null }, { lockedUntil: { lt: now } }],
      },
      data: { lockedUntil: new Date(Date.now() + 60_000), attempts: { increment: 1 } },
    });
    if (!claim.count) return;
    const message = await this.prisma.securityDelivery.findUniqueOrThrow({ where: { id } });
    const challenge = await this.prisma.securityChallenge.findUnique({ where: { id } });
    const user = challenge
      ? await this.prisma.user.findUnique({ where: { id: challenge.userId } })
      : null;
    if (
      !message.payload ||
      message.expiresAt <= now ||
      !challenge ||
      challenge.consumedAt ||
      !user?.isActive ||
      user.closedAt ||
      user.authVersion !== challenge.authVersion
    ) {
      await this.prisma.securityDelivery.update({
        where: { id },
        data: { status: 'EXPIRED', payload: null, lockedUntil: null },
      });
      return;
    }
    try {
      this.assertAvailable(message.channel as 'EMAIL');
      // Never route provider jobs into a test inbox following a configuration change.
      if (this.config.get<string>('AUTH_DELIVERY_MODE') !== 'provider')
        throw new Error('Provider delivery disabled');
      const payload = decryptDelivery(
        this.config.getOrThrow<string>('AUTH_SECURITY_SECRET'),
        message.payload,
      ) as { code: string; summary: string; challengeId: string };
      if (
        !payload ||
        !/^\d{6}$/.test(payload.code) ||
        payload.challengeId !== id ||
        typeof payload.summary !== 'string'
      )
        throw new Error('Invalid delivery');
      const text = `Wallet security: ${payload.summary}\nCode: ${payload.code}\nChallenge ID: ${id}\nThis code expires in 10 minutes. If you did not request it, do not share it.`;
      const response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.config.getOrThrow<string>('RESEND_API_KEY')}`,
          'Content-Type': 'application/json',
          'Idempotency-Key': `security-${id}`,
        },
        body: JSON.stringify({
          from: this.config.getOrThrow<string>('AUTH_EMAIL_FROM'),
          to: [message.recipient],
          subject: 'Wallet security code',
          text,
        }),
        signal: AbortSignal.timeout(10_000),
        redirect: 'error',
      });
      if (!response.ok) throw new Error('Delivery rejected');
      await this.prisma.securityDelivery.update({
        where: { id },
        data: { status: 'SENT', payload: null, lockedUntil: null },
      });
    } catch {
      await this.prisma.securityDelivery.update({
        where: { id },
        data: {
          status: message.attempts >= 5 ? 'FAILED' : 'PENDING',
          ...(message.attempts >= 5 ? { payload: null } : {}),
          nextAttemptAt: new Date(Date.now() + 30_000 * 2 ** Math.min(message.attempts, 5)),
          lockedUntil: null,
        },
      });
    }
  }
}
