import type { Beneficiary } from '@prisma/client';
import { BeneficiariesService } from './beneficiaries.service';
import { PrismaService } from '../prisma/prisma.service';
import { PaystackService } from '../paystack/paystack.service';

describe('Verified beneficiaries', () => {
  const input = { accountNumber: '0001234567', bankCode: '058' };
  const active = { id: 'user1', isActive: true, closedAt: null };
  const row: Beneficiary = {
    id: 'beneficiary1',
    userId: active.id,
    ...input,
    accountName: 'VERIFIED NAME',
    currency: 'NGN',
    provider: 'PAYSTACK',
    providerMode: 'test',
    verifiedAt: new Date(),
    createdAt: new Date(),
    updatedAt: new Date(),
  };
  const tx = {
    $queryRaw: jest.fn(),
    user: { findUnique: jest.fn() },
    beneficiary: { upsert: jest.fn() },
  };
  const prisma = {
    user: { findUnique: jest.fn() },
    $transaction: jest.fn(),
    beneficiary: { findMany: jest.fn(), findFirst: jest.fn() },
  };
  const paystack = { resolveBankAccount: jest.fn(), listBanks: jest.fn() };
  const service = new BeneficiariesService(
    prisma as unknown as PrismaService,
    paystack as unknown as PaystackService,
  );
  beforeEach(() => {
    jest.resetAllMocks();
    prisma.user.findUnique.mockResolvedValue(active);
    tx.user.findUnique.mockResolvedValue(active);
    prisma.$transaction.mockImplementation((fn: (client: typeof tx) => Promise<unknown>) => fn(tx));
    paystack.resolveBankAccount.mockResolvedValue({ ...input, accountName: row.accountName });
    tx.beneficiary.upsert.mockResolvedValue(row);
  });
  it('saves the provider name, uses a user-scoped unique key, and masks the number', async () => {
    const result = await service.create(active.id, input);
    expect(paystack.resolveBankAccount).toHaveBeenCalledWith(input.accountNumber, input.bankCode);
    expect(tx.beneficiary.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId_bankCode_accountNumber: { userId: active.id, ...input } },
        create: expect.objectContaining({
          userId: active.id,
          accountName: row.accountName,
        }) as object,
      }),
    );
    expect(result.accountNumberLast4).toBe('4567');
    expect(result).not.toHaveProperty('accountNumber');
  });
  it('preview does not save and saving resolves the account again', async () => {
    await service.resolve(active.id, input);
    expect(prisma.$transaction).not.toHaveBeenCalled();
    await service.create(active.id, input);
    expect(paystack.resolveBankAccount).toHaveBeenCalledTimes(2);
  });
  it('repeated saves reuse the same ID', async () => {
    expect((await service.create(active.id, input)).id).toBe(
      (await service.create(active.id, input)).id,
    );
  });
  it('does not save if provider resolution fails', async () => {
    paystack.resolveBankAccount.mockRejectedValue(new Error('unavailable'));
    await expect(service.create(active.id, input)).rejects.toThrow();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
  it.each([null, { ...active, isActive: false }, { ...active, closedAt: new Date() }])(
    'blocks ineligible users',
    async (user) => {
      prisma.user.findUnique.mockResolvedValue(user);
      await expect(service.create(active.id, input)).rejects.toThrow('Active user');
      expect(paystack.resolveBankAccount).not.toHaveBeenCalled();
    },
  );
  it('rechecks eligibility after provider I/O', async () => {
    tx.user.findUnique.mockResolvedValue({ ...active, isActive: false });
    await expect(service.create(active.id, input)).rejects.toThrow('Active user');
    expect(tx.beneficiary.upsert).not.toHaveBeenCalled();
  });
  it.each([
    { ...input, accountNumber: '123' },
    { ...input, bankCode: 'bad code' },
    { ...input, accountNumber: 1234567890 },
  ])('rejects malformed input %j', async (value) => {
    await expect(service.create(active.id, value as typeof input)).rejects.toThrow();
    expect(paystack.resolveBankAccount).not.toHaveBeenCalled();
  });
  it('filters reads by owner and returns 404 for inaccessible records', async () => {
    prisma.beneficiary.findFirst.mockResolvedValue(null);
    await expect(service.get('other', row.id)).rejects.toThrow('not found');
    expect(prisma.beneficiary.findFirst).toHaveBeenCalledWith({
      where: { userId: 'other', id: row.id },
    });
    prisma.beneficiary.findMany.mockResolvedValue([row]);
    expect(await service.list(active.id)).toEqual([
      expect.objectContaining({ accountNumberLast4: '4567' }),
    ]);
    expect(prisma.beneficiary.findMany).toHaveBeenCalledWith({
      where: { userId: active.id },
      orderBy: { createdAt: 'desc' },
    });
  });
});
