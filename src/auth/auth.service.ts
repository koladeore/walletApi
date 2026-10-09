import { Injectable, UnauthorizedException, NotFoundException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { UsersService } from '../users/users.service';
import { PrismaService } from '../prisma/prisma.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import * as bcrypt from 'bcrypt';
import { User } from '@prisma/client';
import { createHash, randomUUID } from 'node:crypto';
import { isUUID } from 'class-validator';

interface JwtPayload {
  sub: string;
  sid: string;
  jti: string;
  authVersion: number;
  kind: 'access' | 'refresh';
}

@Injectable()
export class AuthService {
  constructor(
    private usersService: UsersService,
    private jwtService: JwtService,
    private configService: ConfigService,
    private prisma: PrismaService,
  ) {}
  register(dto: RegisterDto) {
    return this.usersService.create(dto);
  }

  async login(dto: LoginDto, userAgent?: string) {
    const user = await this.usersService.findByEmail(dto.email);
    if (!user?.isActive || user.closedAt || !(await bcrypt.compare(dto.password, user.password)))
      throw new UnauthorizedException('Invalid credentials');
    return this.generateTokens(user, userAgent);
  }

  private async tokens(user: User, sid: string, expiresAt: Date) {
    const jti = randomUUID();
    const payload = { sub: user.id, sid, email: user.email, authVersion: user.authVersion };
    const remaining = Math.floor((expiresAt.getTime() - Date.now()) / 1000);
    if (remaining <= 0) throw new UnauthorizedException('Session expired');
    const [accessToken, refreshToken] = await Promise.all([
      this.jwtService.signAsync({ ...payload, kind: 'access', jti: randomUUID() }),
      this.jwtService.signAsync(
        { ...payload, kind: 'refresh', jti },
        {
          secret: this.configService.getOrThrow<string>('REFRESH_SECRET'),
          expiresIn: remaining,
        },
      ),
    ]);
    return {
      jti,
      hash: createHash('sha256').update(refreshToken).digest('hex'),
      response: {
        accessToken,
        refreshToken,
        sessionId: sid,
        sessionExpiresAt: expiresAt,
        user: {
          id: user.id,
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
          role: user.role,
        },
      },
    };
  }

  async generateTokens(expected: User, userAgent?: string) {
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM users WHERE id=${expected.id} FOR UPDATE`;
      const user = await tx.user.findUnique({ where: { id: expected.id } });
      if (
        !user?.isActive ||
        user.closedAt ||
        user.authVersion !== expected.authVersion ||
        user.password !== expected.password
      )
        throw new UnauthorizedException('Authentication changed; log in again');
      const sid = randomUUID();
      const expiresAt = new Date(
        Date.now() + this.configService.getOrThrow<number>('REFRESH_EXPIRES_IN') * 1000,
      );
      const issued = await this.tokens(user, sid, expiresAt);
      await tx.authSession.create({
        data: { id: sid, userId: user.id, userAgent: userAgent?.slice(0, 512) || null, expiresAt },
      });
      await tx.sessionRefreshToken.create({
        data: { id: issued.jti, sessionId: sid, tokenHash: issued.hash, expiresAt },
      });
      await tx.auditLog.create({
        data: { userId: user.id, action: 'SESSION_CREATED', metadata: { sessionId: sid } },
      });
      return issued.response;
    });
  }

  private async refreshPayload(token: string) {
    try {
      if (typeof token !== 'string' || token.length > 4096) throw new Error();
      const payload = await this.jwtService.verifyAsync<JwtPayload>(token, {
        secret: this.configService.getOrThrow<string>('REFRESH_SECRET'),
      });
      if (
        payload.kind !== 'refresh' ||
        !isUUID(payload.sub) ||
        !isUUID(payload.sid) ||
        !isUUID(payload.jti) ||
        !Number.isInteger(payload.authVersion)
      )
        throw new Error();
      return payload;
    } catch {
      throw new UnauthorizedException('Invalid refresh token');
    }
  }

  async refreshTokens(refreshToken: string) {
    const payload = await this.refreshPayload(refreshToken);
    const hash = createHash('sha256').update(refreshToken).digest('hex');
    const result = await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM users WHERE id=${payload.sub} FOR UPDATE`;
      const user = await tx.user.findUnique({ where: { id: payload.sub } });
      const session = await tx.authSession.findUnique({ where: { id: payload.sid } });
      const token = await tx.sessionRefreshToken.findUnique({ where: { id: payload.jti } });
      if (
        !user?.isActive ||
        user.closedAt ||
        user.authVersion !== payload.authVersion ||
        !session ||
        session.userId !== user.id ||
        session.revokedAt ||
        session.expiresAt <= new Date() ||
        !token ||
        token.sessionId !== session.id ||
        token.tokenHash !== hash ||
        token.expiresAt <= new Date()
      )
        return null;
      if (token.consumedAt) {
        await tx.authSession.update({
          where: { id: session.id },
          data: { revokedAt: new Date(), revokeReason: 'REFRESH_REUSE' },
        });
        await tx.auditLog.create({
          data: {
            userId: user.id,
            action: 'REFRESH_TOKEN_REUSE',
            metadata: { sessionId: session.id },
          },
        });
        // Commit revocation before returning 401; throwing here would roll it back.
        return null;
      }
      const issued = await this.tokens(user, session.id, session.expiresAt);
      await tx.sessionRefreshToken.update({
        where: { id: token.id },
        data: { consumedAt: new Date() },
      });
      await tx.sessionRefreshToken.create({
        data: {
          id: issued.jti,
          sessionId: session.id,
          tokenHash: issued.hash,
          expiresAt: session.expiresAt,
        },
      });
      await tx.authSession.update({ where: { id: session.id }, data: { lastUsedAt: new Date() } });
      return issued.response;
    });
    if (!result) throw new UnauthorizedException('Invalid refresh token; log in again');
    return result;
  }

  async logout(refreshToken: string) {
    let payload: JwtPayload;
    try {
      payload = await this.refreshPayload(refreshToken);
    } catch {
      return;
    }
    const hash = createHash('sha256').update(refreshToken).digest('hex');
    await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM users WHERE id=${payload.sub} FOR UPDATE`;
      const user = await tx.user.findUnique({ where: { id: payload.sub } });
      const token = await tx.sessionRefreshToken.findUnique({ where: { id: payload.jti } });
      if (
        !user ||
        user.authVersion !== payload.authVersion ||
        !token ||
        token.sessionId !== payload.sid ||
        token.tokenHash !== hash
      )
        return;
      const changed = await tx.authSession.updateMany({
        where: { id: payload.sid, userId: user.id, revokedAt: null },
        data: { revokedAt: new Date(), revokeReason: 'LOGOUT' },
      });
      if (changed.count)
        await tx.auditLog.create({
          data: {
            userId: user.id,
            action: 'SESSION_REVOKED',
            metadata: { sessionId: payload.sid, reason: 'LOGOUT' },
          },
        });
    });
  }

  async sessions(userId: string, currentSessionId: string) {
    const rows = await this.prisma.authSession.findMany({
      where: { userId, revokedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: 'desc' },
      select: { id: true, userAgent: true, createdAt: true, lastUsedAt: true, expiresAt: true },
    });
    return rows.map((row) => ({ ...row, current: row.id === currentSessionId }));
  }
  async revokeSession(userId: string, sessionId: string) {
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM users WHERE id=${userId} FOR UPDATE`;
      const session = await tx.authSession.findUnique({ where: { id: sessionId } });
      if (!session || session.userId !== userId) throw new NotFoundException('Session not found');
      if (!session.revokedAt) {
        await tx.authSession.update({
          where: { id: sessionId },
          data: { revokedAt: new Date(), revokeReason: 'USER_REVOKED' },
        });
        await tx.auditLog.create({
          data: {
            userId,
            action: 'SESSION_REVOKED',
            metadata: { sessionId, reason: 'USER_REVOKED' },
          },
        });
      }
      return { message: 'Session logged out' };
    });
  }
  async logoutAll(userId: string) {
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM users WHERE id=${userId} FOR UPDATE`;
      await tx.authSession.updateMany({
        where: { userId, revokedAt: null },
        data: { revokedAt: new Date(), revokeReason: 'LOGOUT_ALL' },
      });
      await tx.authToken.updateMany({ where: { userId }, data: { isRevoked: true } });
      await tx.user.update({ where: { id: userId }, data: { authVersion: { increment: 1 } } });
      await tx.auditLog.create({ data: { userId, action: 'ALL_SESSIONS_REVOKED' } });
      return { message: 'All devices logged out. Log in again.' };
    });
  }
}
