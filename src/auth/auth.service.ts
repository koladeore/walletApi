import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { UsersService } from '../users/users.service';
import { PrismaService } from '../prisma/prisma.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import * as bcrypt from 'bcrypt';
import { User } from '@prisma/client';

interface JwtPayload {
  sub: string;
  email: string;
}

@Injectable()
export class AuthService {
  constructor(
    private usersService: UsersService,
    private jwtService: JwtService,
    private configService: ConfigService,
    private prisma: PrismaService,
  ) {}

  async register(dto: RegisterDto) {
    return this.usersService.create(dto);
  }

  async login(dto: LoginDto) {
    const user = await this.usersService.findByEmail(dto.email);
    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const isPasswordValid = await bcrypt.compare(dto.password, user.password);
    if (!isPasswordValid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    return this.generateTokens(user);
  }

  async generateTokens(user: User) {
    const payload = { sub: user.id, email: user.email };

    const [accessToken, refreshToken] = await Promise.all([
      this.jwtService.signAsync(payload),
      this.jwtService.signAsync(payload, {
        secret: this.configService.get('REFRESH_SECRET'),
        expiresIn: this.configService.get('REFRESH_EXPIRES_IN'),
      }),
    ]);

    // Store hashed refresh token in DB
    const salt = await bcrypt.genSalt();
    const hashedRefreshToken = await bcrypt.hash(refreshToken, salt);

    await this.prisma.authToken.create({
      data: {
        token: hashedRefreshToken,
        userId: user.id,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days matching env
      },
    });

    return {
      accessToken,
      refreshToken,
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
      },
    };
  }

  async refreshTokens(refreshToken: string) {
    try {
      const payload = await this.jwtService.verifyAsync<JwtPayload>(refreshToken, {
        secret: this.configService.get('REFRESH_SECRET'),
      });

      const user = await this.usersService.findById(payload.sub);
      if (!user) throw new UnauthorizedException();

      // Find token in DB
      const dbTokens = await this.prisma.authToken.findMany({
        where: { userId: user.id, isRevoked: false },
      });

      let validTokenFound = false;
      let tokenIdToRevoke = '';

      for (const t of dbTokens) {
        const isMatch = await bcrypt.compare(refreshToken, t.token);
        if (isMatch) {
          validTokenFound = true;
          tokenIdToRevoke = t.id;
          break;
        }
      }

      if (!validTokenFound) throw new UnauthorizedException('Invalid refresh token');

      // Revoke old token (Token Rotation)
      await this.prisma.authToken.update({
        where: { id: tokenIdToRevoke },
        data: { isRevoked: true },
      });

      return this.generateTokens(user);
    } catch {
      throw new UnauthorizedException('Invalid refresh token');
    }
  }

  async logout(refreshToken: string) {
    // In a real app, we would decode to find user, then find the specific token to revoke
    // Since it's hashed, we have to iterate or find by some other identifier if we had one
    // For simplicity, we'll try to find any match
    try {
      const payload = await this.jwtService.verifyAsync<JwtPayload>(refreshToken, {
        secret: this.configService.get('REFRESH_SECRET'),
      });

      const dbTokens = await this.prisma.authToken.findMany({
        where: { userId: payload.sub, isRevoked: false },
      });

      for (const t of dbTokens) {
        const isMatch = await bcrypt.compare(refreshToken, t.token);
        if (isMatch) {
          await this.prisma.authToken.update({
            where: { id: t.id },
            data: { isRevoked: true },
          });
          break;
        }
      }
    } catch {
      // Ignore errors on logout
    }
  }
}
