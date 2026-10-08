import { ConfirmationService } from './confirmation.service';
import { PrismaService } from '../prisma/prisma.service';
import { PaystackService } from '../paystack/paystack.service';
import type { FundingRequest } from '@prisma/client';
import type { PaystackPayment } from '../paystack/payment';

describe('Verified payment confirmation', () => {
  let request: FundingRequest;
  const payment: PaystackPayment = {
    reference: 'fund-test',
    amountMinor: '10050',
    currency: 'NGN',
    domain: 'test',
    status: 'success',
    email: 'owner@example.com',
    transactionId: '123',
  };
  const tx = {
    $queryRaw: jest.fn(),
    fundingRequest: { findUniqueOrThrow: jest.fn(), update: jest.fn() },
    wallet: { findUniqueOrThrow: jest.fn(), update: jest.fn() },
    transaction: { create: jest.fn() },
  };
  const prisma = { fundingRequest: { findFirst: jest.fn() }, $transaction: jest.fn() };
  const paystack = { verifyPayment: jest.fn() };
  const service = new ConfirmationService(
    prisma as unknown as PrismaService,
    paystack as unknown as PaystackService,
  );
  beforeEach(() => {
    jest.resetAllMocks();
    request = {
      id: 'funding1',
      reference: payment.reference,
      idempotencyKey: 'key',
      userId: 'user1',
      walletId: 'wallet1',
      expectedEmail: payment.email,
      amountMinor: 10050n,
      currency: 'NGN',
      provider: 'PAYSTACK',
      providerMode: 'test',
      status: 'PENDING',
      authorizationUrl: null,
      accessCode: null,
      providerTransactionId: null,
      verifiedAt: null,
      lastCheckedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    prisma.fundingRequest.findFirst.mockImplementation(() => request);
    tx.fundingRequest.findUniqueOrThrow.mockImplementation(() => request);
    tx.fundingRequest.update.mockImplementation(({ data }: { data: Partial<FundingRequest> }) => {
      request = { ...request, ...data };
      return request;
    });
    tx.wallet.findUniqueOrThrow.mockResolvedValue({
      id: 'wallet1',
      userId: 'user1',
      currency: 'NGN',
      balanceMinor: 0n,
      closedAt: null,
    });
    prisma.$transaction.mockImplementation((fn: (client: typeof tx) => Promise<unknown>) => fn(tx));
    paystack.verifyPayment.mockResolvedValue(payment);
  });

  it('posts matching confirmed payments once and returns SUCCESS on replay', async () => {
    expect((await service.confirm(payment.reference, 'user1')).status).toBe('SUCCESS');
    expect(tx.transaction.create).toHaveBeenCalledWith({
      data: {
        id: 'funding:funding1',
        referenceId: 'paystack:fund-test',
        amountMinor: 10050n,
        currency: 'NGN',
        type: 'CREDIT',
        status: 'SUCCESS',
        receiverWalletId: 'wallet1',
        metadata: {
          fundingSource: 'PAYSTACK',
          fundingRequestId: 'funding1',
          providerTransactionId: '123',
          providerMode: 'test',
        },
      },
    });
    expect(tx.wallet.update).toHaveBeenCalledWith({
      where: { id: 'wallet1' },
      data: { balanceMinor: { increment: 10050n } },
    });
    await service.confirm(payment.reference, 'user1');
    expect(tx.transaction.create).toHaveBeenCalledTimes(1);
    expect(paystack.verifyPayment).toHaveBeenCalledTimes(1);
  });

  it.each([
    { amountMinor: '10051' },
    { currency: 'USD' },
    { domain: 'live' },
    { email: 'attacker@example.com' },
    { reference: 'other' },
  ])('does not credit mismatched verification %j', async (change) => {
    paystack.verifyPayment.mockResolvedValue({ ...payment, ...change });
    await expect(service.confirm(payment.reference)).rejects.toThrow('does not match');
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(tx.wallet.update).not.toHaveBeenCalled();
  });

  it.each(['pending', 'ongoing', 'failed', 'abandoned', 'reversed'])(
    'does not credit provider status %s',
    async (status) => {
      paystack.verifyPayment.mockResolvedValue({ ...payment, status });
      const result = await service.confirm(payment.reference);
      expect(result.status).not.toBe('SUCCESS');
      expect(tx.wallet.update).not.toHaveBeenCalled();
      expect(tx.transaction.create).not.toHaveBeenCalled();
    },
  );

  it('does not trust a mismatched webhook even when API verification could succeed', async () => {
    await expect(
      service.confirm(payment.reference, undefined, { ...payment, amountMinor: '1' }),
    ).rejects.toThrow('Webhook payment');
    expect(paystack.verifyPayment).not.toHaveBeenCalled();
  });

  it('requires webhook and verification transaction IDs to agree', async () => {
    await expect(
      service.confirm(payment.reference, undefined, { ...payment, transactionId: '456' }),
    ).rejects.toThrow('transaction');
    expect(tx.transaction.create).not.toHaveBeenCalled();
  });

  it('restricts manual verification to the owner', async () => {
    prisma.fundingRequest.findFirst.mockResolvedValue(null);
    await expect(service.confirm(payment.reference, 'other-user')).rejects.toThrow('not found');
    expect(prisma.fundingRequest.findFirst).toHaveBeenCalledWith({
      where: { reference: payment.reference, userId: 'other-user' },
    });
    expect(paystack.verifyPayment).not.toHaveBeenCalled();
  });

  it('checks success again under lock after a concurrent confirmation', async () => {
    tx.fundingRequest.findUniqueOrThrow.mockResolvedValue({ ...request, status: 'SUCCESS' });
    await service.confirm(payment.reference);
    expect(tx.transaction.create).not.toHaveBeenCalled();
  });

  it('cannot credit a closed wallet', async () => {
    tx.wallet.findUniqueOrThrow.mockResolvedValue({
      id: 'wallet1',
      userId: 'user1',
      currency: 'NGN',
      balanceMinor: 0n,
      closedAt: new Date(),
    });
    await expect(service.confirm(payment.reference)).rejects.toThrow('reconciliation');
    expect(tx.transaction.create).not.toHaveBeenCalled();
  });

  it('leaves the payment uncredited when verification is unavailable', async () => {
    paystack.verifyPayment.mockRejectedValue(new Error('unavailable'));
    await expect(service.confirm(payment.reference)).rejects.toThrow();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});
