import { randomInt, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import type { Prisma, User } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { describeAction } from './actions';
import type { SecurityAction } from './actions';
import { encryptDelivery, secretHash } from './crypto';
import { SecurityDeliveryService } from './delivery.service';

@Injectable()
export class SecurityService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly delivery: SecurityDeliveryService,
  ) {}
  private secret() {
    return this.config.getOrThrow<string>('AUTH_SECURITY_SECRET');
  }
  private async user(id: string) {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user || !user.isActive || user.closedAt)
      throw new UnauthorizedException('Active account required');
    return user;
  }
  private hash(id: string, code: string) {
    return secretHash(this.secret(), `code:${id}:${code}`);
  }
  private async issue(
    user: User,
    purpose: 'EMAIL' | 'PHONE' | 'RESET' | 'STEP_UP',
    target: string,
    channel: 'EMAIL',
    summary: string,
    action?: SecurityAction,
    binding?: string,
  ) {
    this.delivery.assertAvailable(channel);
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM users WHERE id=${user.id} FOR UPDATE`;
      const current = await tx.user.findUniqueOrThrow({ where: { id: user.id } });
      if (
        !current.isActive ||
        current.closedAt ||
        current.authVersion !== user.authVersion ||
        current.password !== user.password
      )
        throw new UnauthorizedException('Account state changed');
      const recent = await tx.securityChallenge.findFirst({
        where: { userId: user.id, purpose },
        orderBy: { createdAt: 'desc' },
      });
      if (recent && recent.createdAt.getTime() > Date.now() - 60_000)
        throw new ConflictException('Wait at least 60 seconds before requesting another code');
      if (
        (await tx.securityChallenge.count({
          where: { userId: user.id, createdAt: { gte: new Date(Date.now() - 3600_000) } },
        })) >= 10
      )
        throw new ConflictException('Security code request limit reached');
      await tx.securityChallenge.updateMany({
        where: { userId: user.id, purpose, consumedAt: null },
        data: { consumedAt: new Date() },
      });
      const id = randomUUID();
      const code = randomInt(0, 1_000_000).toString().padStart(6, '0');
      const expiresAt = new Date(Date.now() + 600_000);
      await tx.securityChallenge.create({
        data: {
          id,
          userId: user.id,
          purpose,
          target,
          codeHash: this.hash(id, code),
          authVersion: current.authVersion,
          action,
          binding,
          expiresAt,
        },
      });
      await tx.securityDelivery.create({
        data: {
          id,
          channel,
          recipient: target,
          payload: encryptDelivery(this.secret(), { code, summary, challengeId: id }),
          status: this.config.get<string>('AUTH_DELIVERY_MODE') === 'test' ? 'TEST' : 'PENDING',
          expiresAt,
        },
      });
      await tx.auditLog.create({
        data: {
          userId: user.id,
          action: `SECURITY_${purpose}_REQUESTED`,
          metadata: { challengeId: id, ...(action ? { securityAction: action } : {}) },
        },
      });
      return { challengeId: id, expiresAt };
    });
  }
  async status(userId: string) {
    const user = await this.user(userId);
    return {
      emailVerified: Boolean(user.emailVerifiedAt),
      emailVerifiedAt: user.emailVerifiedAt,
    };
  }
  async requestEmail(userId: string) {
    const user = await this.user(userId);
    return this.issue(user, 'EMAIL', user.email, 'EMAIL', 'Verify your email address');
  }
  async requestReset(email: string) {
    const started = Date.now();
    try {
      const user = await this.prisma.user.findUnique({ where: { email } });
      if (user?.isActive && !user.closedAt)
        await this.issue(user, 'RESET', user.email, 'EMAIL', 'Reset your password');
    } catch {
      /* Keep public responses uniform, including delivery/cooldown failures. */
    }
    await new Promise<void>((resolve) =>
      setTimeout(resolve, Math.max(0, 250 - (Date.now() - started))),
    );
    return { message: 'If the account is eligible, a password reset code will be delivered.' };
  }
  async requestStepUp(
    userId: string,
    password: string,
    action: SecurityAction,
    details: Record<string, unknown>,
  ) {
    const user = await this.user(userId);
    if (!user.emailVerifiedAt)
      throw new ForbiddenException('Verify your email before sensitive actions');
    if (action === 'ADMIN' && user.role !== 'ADMIN')
      throw new ForbiddenException('Administrator required');
    if (typeof password !== 'string' || !(await bcrypt.compare(password, user.password)))
      throw new UnauthorizedException('Invalid credentials');
    const descriptor = describeAction(action, details);
    return this.issue(
      user,
      'STEP_UP',
      user.email,
      'EMAIL',
      descriptor.summary,
      action,
      descriptor.binding,
    );
  }
  private async consume(
    purpose: string,
    id: string,
    code: string,
    userId: string | undefined,
    perform: (
      tx: Prisma.TransactionClient,
      user: User,
      challenge: { target: string; action: string | null; binding: string | null },
    ) => Promise<unknown>,
  ) {
    if (typeof id !== 'string' || typeof code !== 'string' || !/^\d{6}$/.test(code))
      throw new UnauthorizedException('Invalid or expired security code');
    // Failure counters commit; throwing inside the transaction would roll them back.
    const result = await this.prisma.$transaction(async (tx) => {
      const before = await tx.securityChallenge.findUnique({ where: { id } });
      if (!before || before.purpose !== purpose || (userId && before.userId !== userId))
        return { valid: false };
      await tx.$queryRaw`SELECT id FROM users WHERE id=${before.userId} FOR UPDATE`;
      await tx.$queryRaw`SELECT id FROM security_challenges WHERE id=${id} FOR UPDATE`;
      const challenge = await tx.securityChallenge.findUniqueOrThrow({ where: { id } });
      const user = await tx.user.findUniqueOrThrow({ where: { id: before.userId } });
      if (
        challenge.consumedAt ||
        challenge.expiresAt <= new Date() ||
        challenge.attempts >= 5 ||
        !user.isActive ||
        user.closedAt ||
        challenge.authVersion !== user.authVersion ||
        (purpose !== 'PHONE' && challenge.target !== user.email)
      )
        return { valid: false };
      const expected = Buffer.from(challenge.codeHash, 'hex');
      const supplied = Buffer.from(this.hash(id, code), 'hex');
      if (expected.length !== supplied.length || !timingSafeEqual(expected, supplied)) {
        await tx.securityChallenge.update({
          where: { id },
          data: {
            attempts: { increment: 1 },
            ...(challenge.attempts >= 4 ? { consumedAt: new Date() } : {}),
          },
        });
        await tx.auditLog.create({
          data: {
            userId: user.id,
            action: 'SECURITY_CODE_REJECTED',
            metadata: { challengeId: id, purpose },
          },
        });
        return { valid: false };
      }
      await tx.securityChallenge.update({ where: { id }, data: { consumedAt: new Date() } });
      await tx.securityDelivery.updateMany({
        where: { id },
        data: { payload: null, status: 'EXPIRED' },
      });
      const value = await perform(tx, user, challenge);
      await tx.auditLog.create({
        data: {
          userId: user.id,
          action: `SECURITY_${purpose}_CONFIRMED`,
          metadata: { challengeId: id },
        },
      });
      return { valid: true, value };
    });
    if (!result.valid) throw new UnauthorizedException('Invalid or expired security code');
    return result.value;
  }
  confirmEmail(userId: string, id: string, code: string) {
    return this.consume('EMAIL', id, code, userId, async (tx, user) => {
      await tx.user.update({ where: { id: user.id }, data: { emailVerifiedAt: new Date() } });
      return { emailVerified: true };
    });
  }
  async resetPassword(id: string, code: string, password: string) {
    if (
      typeof password !== 'string' ||
      password.length < 12 ||
      Buffer.byteLength(password, 'utf8') > 72
    )
      throw new BadRequestException(
        'New password must have at least 12 characters and at most 72 UTF-8 bytes',
      );
    return this.consume('RESET', id, code, undefined, async (tx, user) => {
      const hash = await bcrypt.hash(password, 12);
      await tx.user.update({
        where: { id: user.id },
        data: { password: hash, authVersion: { increment: 1 } },
      });
      await tx.authToken.updateMany({ where: { userId: user.id }, data: { isRevoked: true } });
      await tx.securityChallenge.updateMany({
        where: { userId: user.id, consumedAt: null },
        data: { consumedAt: new Date() },
      });
      await tx.stepUpProof.updateMany({
        where: { userId: user.id, consumedAt: null },
        data: { consumedAt: new Date() },
      });
      return { message: 'Password reset. Log in again; previous sessions are invalid.' };
    });
  }
  confirmStepUp(userId: string, id: string, code: string) {
    return this.consume('STEP_UP', id, code, userId, async (tx, user, challenge) => {
      if (!user.emailVerifiedAt || !challenge.action || !challenge.binding)
        throw new ForbiddenException('Verified email and action required');
      const token = randomBytes(32).toString('hex');
      const expiresAt = new Date(Date.now() + 300_000);
      await tx.stepUpProof.create({
        data: {
          userId: user.id,
          tokenHash: secretHash(this.secret(), `proof:${token}`),
          action: challenge.action,
          binding: challenge.binding,
          authVersion: user.authVersion,
          expiresAt,
        },
      });
      return { stepUpToken: token, expiresAt, action: challenge.action };
    });
  }
  async authorize(
    userId: string,
    token: string | undefined,
    action: SecurityAction,
    details: Record<string, unknown>,
  ) {
    if (typeof token !== 'string' || !/^[a-f0-9]{64}$/.test(token))
      throw new ForbiddenException('A fresh x-step-up-token is required');
    const binding = describeAction(action, details).binding;
    const tokenHash = secretHash(this.secret(), `proof:${token}`);
    const valid = await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM users WHERE id=${userId} FOR UPDATE`;
      const user = await tx.user.findUnique({ where: { id: userId } });
      if (
        !user?.isActive ||
        user.closedAt ||
        !user.emailVerifiedAt ||
        (action === 'ADMIN' && user.role !== 'ADMIN')
      )
        return false;
      const consumed = await tx.stepUpProof.updateMany({
        where: {
          userId,
          tokenHash,
          action,
          binding,
          authVersion: user.authVersion,
          consumedAt: null,
          expiresAt: { gt: new Date() },
        },
        data: { consumedAt: new Date() },
      });
      if (!consumed.count) return false;
      await tx.auditLog.create({
        data: { userId, action: 'STEP_UP_USED', metadata: { securityAction: action, binding } },
      });
      return user.authVersion;
    });
    if (valid === false)
      throw new ForbiddenException('Step-up proof is expired, used, or does not match this action');
    return valid;
  }
}
