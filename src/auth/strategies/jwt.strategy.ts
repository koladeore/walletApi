import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
import { isUUID } from 'class-validator';
import { UsersService } from '../../users/users.service';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    configService: ConfigService,
    private usersService: UsersService,
    private prisma: PrismaService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.getOrThrow<string>('JWT_SECRET'),
    });
  }

  async validate(payload: {
    sub: string;
    email: string;
    authVersion?: number;
    sid?: string;
    kind?: string;
  }) {
    const user = await this.usersService.findById(payload.sub);
    if (!user || !user.isActive || user.closedAt) {
      throw new UnauthorizedException();
    }
    if ((payload.authVersion ?? 0) !== user.authVersion) {
      throw new UnauthorizedException();
    }
    if (payload.kind !== 'access' || !payload.sid || !isUUID(payload.sid))
      throw new UnauthorizedException();
    const session = await this.prisma.authSession.findUnique({ where: { id: payload.sid } });
    if (
      !session ||
      session.userId !== user.id ||
      session.revokedAt ||
      session.expiresAt <= new Date()
    )
      throw new UnauthorizedException();
    return { ...user, sessionId: session.id };
  }
}
