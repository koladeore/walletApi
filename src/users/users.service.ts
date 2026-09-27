import {
  Injectable,
  ConflictException,
  BadRequestException,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma, User } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { EmailService } from '../email/email.service';
import { RegisterDto } from '../auth/dto/register.dto';
import { UpdateUserStatusDto } from './dto/update-user-status.dto';

const userProfileSelect = {
  id: true,
  email: true,
  firstName: true,
  lastName: true,
  isActive: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.UserSelect;

type PublicUser = Prisma.UserGetPayload<{ select: typeof userProfileSelect }>;

@Injectable()
export class UsersService {
  constructor(
    private prisma: PrismaService,
    private emailService: EmailService,
  ) {}

  async findByEmail(email: string): Promise<User | null> {
    return this.prisma.user.findUnique({
      where: { email },
    });
  }

  async findById(id: string): Promise<User | null> {
    return this.prisma.user.findUnique({
      where: { id },
    });
  }

  async getProfile(id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: { ...userProfileSelect, role: true },
    });
    return user;
  }

  async getAllUsers() {
    return this.prisma.user.findMany({
      select: userProfileSelect,
      orderBy: { id: 'asc' },
    });
  }

  async getWallet(userId: string) {
    return this.prisma.wallet.findUnique({
      where: { userId },
    });
  }

  async lookupRecipient(email: string) {
    return this.prisma.user.findFirst({
      where: { email, isActive: true, wallet: { isNot: null } },
      select: { id: true, firstName: true, lastName: true },
    });
  }

  async create(data: RegisterDto): Promise<PublicUser> {
    const existingUser = await this.findByEmail(data.email);
    if (existingUser) {
      throw new ConflictException('Email already exists');
    }

    // Hash password
    const salt = await bcrypt.genSalt();
    const hashedPassword = await bcrypt.hash(data.password, salt);

    // Create user and wallet in a transaction
    const createdUser = await this.prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          email: data.email,
          firstName: data.firstName,
          lastName: data.lastName,
          password: hashedPassword,
          role: 'USER',
        },
        select: userProfileSelect,
      });

      // Auto-create wallet
      await tx.wallet.create({
        data: {
          userId: user.id,
          currency: 'USD',
          balance: 0,
        },
      });

      return user;
    });

    // Fire off async welcome email without waiting
    this.emailService
      .sendWelcomeEmail(createdUser.email, createdUser.firstName || 'User')
      .catch((err) => {
        console.error('Failed to queue welcome email', err);
      });

    return createdUser;
  }

  async updateStatus(actorId: string, userId: string, dto: UpdateUserStatusDto) {
    if (actorId === userId && !dto.isActive) {
      throw new BadRequestException('You cannot deactivate your own account');
    }
    return this.prisma.$transaction(async (tx) => {
      // Serialize status changes and recheck the actor while holding the locks.
      const ids = [...new Set([actorId, userId])].sort();
      for (const id of ids) {
        await tx.$queryRaw`SELECT id FROM users WHERE id = ${id} FOR UPDATE`;
      }
      const actor = await tx.user.findUnique({ where: { id: actorId } });
      if (!actor?.isActive || actor.role !== 'ADMIN') throw new ForbiddenException();
      const target = await tx.user.findUnique({ where: { id: userId } });
      if (!target) throw new NotFoundException('User not found');

      const changed = target.isActive !== dto.isActive;
      const user = await tx.user.update({
        where: { id: userId },
        data: {
          isActive: dto.isActive,
          ...(changed ? { authVersion: { increment: 1 } } : {}),
        },
        select: userProfileSelect,
      });
      if (changed || !dto.isActive) {
        await tx.authToken.updateMany({
          where: { userId, isRevoked: false },
          data: { isRevoked: true },
        });
      }
      await tx.auditLog.create({
        data: {
          userId: actorId,
          action: 'USER_STATUS_UPDATED',
          metadata: {
            targetUserId: userId,
            previousIsActive: target.isActive,
            isActive: dto.isActive,
            reason: dto.reason,
          },
        },
      });
      return user;
    });
  }
}
