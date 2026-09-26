import { Injectable, ConflictException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma, User } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { EmailService } from '../email/email.service';

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
      select: userProfileSelect,
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

  async create(data: Prisma.UserCreateInput): Promise<PublicUser> {
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
          ...data,
          password: hashedPassword,
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
}
