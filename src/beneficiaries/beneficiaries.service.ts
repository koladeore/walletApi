import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Beneficiary } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { PaystackService } from '../paystack/paystack.service';
import { BankAccountDto } from './dto/bank-account.dto';

@Injectable()
export class BeneficiariesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly paystack: PaystackService,
  ) {}

  private async activeUser(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user || !user.isActive || user.closedAt)
      throw new ForbiddenException('Active user required');
  }
  private validate(input: BankAccountDto) {
    if (
      typeof input.accountNumber !== 'string' ||
      !/^\d{10}$/.test(input.accountNumber) ||
      typeof input.bankCode !== 'string' ||
      !/^[A-Za-z0-9]{2,20}$/.test(input.bankCode)
    )
      throw new BadRequestException('Use a ten-digit account number and a bank code as strings');
  }
  private response(saved: Beneficiary) {
    return {
      id: saved.id,
      bankCode: saved.bankCode,
      accountNumberLast4: saved.accountNumber.slice(-4),
      accountName: saved.accountName,
      currency: saved.currency,
      providerMode: saved.providerMode,
      verifiedAt: saved.verifiedAt,
      createdAt: saved.createdAt,
    };
  }
  async banks(userId: string, page: number) {
    await this.activeUser(userId);
    return this.paystack.listBanks(page);
  }
  async resolve(userId: string, input: BankAccountDto) {
    this.validate(input);
    await this.activeUser(userId);
    return {
      ...(await this.paystack.resolveBankAccount(input.accountNumber, input.bankCode)),
      currency: 'NGN',
      providerMode: 'test',
    };
  }
  async create(userId: string, input: BankAccountDto, expectedAuthVersion?: number) {
    this.validate(input);
    await this.activeUser(userId);
    // Re-resolve on saving; never trust a name supplied by the client or a prior preview.
    const resolved = await this.paystack.resolveBankAccount(input.accountNumber, input.bankCode);
    const saved = await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM users WHERE id=${userId} FOR SHARE`;
      const user = await tx.user.findUnique({ where: { id: userId } });
      if (!user || !user.isActive || user.closedAt)
        throw new ForbiddenException('Active user required');
      if (expectedAuthVersion !== undefined && user.authVersion !== expectedAuthVersion)
        throw new ForbiddenException('Authentication changed; repeat step-up');
      // Serializes retries even when Prisma cannot issue a native upsert.
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`beneficiary:${userId}:${input.bankCode}:${input.accountNumber}`}, 0))::text`;
      return tx.beneficiary.upsert({
        where: {
          userId_bankCode_accountNumber: {
            userId,
            bankCode: input.bankCode,
            accountNumber: input.accountNumber,
          },
        },
        create: { userId, ...resolved, verifiedAt: new Date() },
        update: { accountName: resolved.accountName, verifiedAt: new Date() },
      });
    });
    return this.response(saved);
  }
  async list(userId: string) {
    const rows = await this.prisma.beneficiary.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map((row) => this.response(row));
  }
  async get(userId: string, id: string) {
    const row = await this.prisma.beneficiary.findFirst({ where: { userId, id } });
    if (!row) throw new NotFoundException('Beneficiary not found');
    return this.response(row);
  }
}
