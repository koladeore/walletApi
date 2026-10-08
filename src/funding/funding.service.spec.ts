import { ConfigService } from '@nestjs/config';
import type { FundingRequest } from '@prisma/client';
import { FundingService } from './funding.service';
import { PrismaService } from '../prisma/prisma.service';
import { PaystackService } from '../paystack/paystack.service';

describe('Funding initialization', () => {
  let saved: FundingRequest | null;
  const wallet = { id: 'wallet1', currency: 'NGN', closedAt: null };
  const user = { id: 'user1', email: 'owner@example.com', isActive: true, closedAt: null, wallet };
  const fundingRequest = {
    findUnique: jest.fn(),
    findFirst: jest.fn(),
    create: jest.fn(),
    updateMany: jest.fn(),
  };
  const tx = { $queryRaw: jest.fn(), fundingRequest, user: { findUnique: jest.fn() } };
  const prisma = { $transaction: jest.fn(), fundingRequest };
  const paystack = new PaystackService(
    new ConfigService({ PAYSTACK_ENABLED: 'true', PAYSTACK_SECRET_KEY: 'sk_test_example123' }),
  );
  const service = new FundingService(prisma as unknown as PrismaService, paystack);
  let initialize: jest.SpiedFunction<PaystackService['initializePayment']>;

  beforeEach(() => {
    jest.clearAllMocks();
    saved = null;
    prisma.$transaction.mockImplementation(async (fn: (client: typeof tx) => Promise<unknown>) =>
      fn(tx),
    );
    tx.user.findUnique.mockResolvedValue(user);
    fundingRequest.findUnique.mockImplementation(() => saved);
    fundingRequest.findFirst.mockImplementation(
      ({ where }: { where: { userId: string; reference: string } }) =>
        saved?.userId === where.userId && saved.reference === where.reference ? saved : null,
    );
    fundingRequest.create.mockImplementation(
      ({
        data,
      }: {
        data: Omit<
          FundingRequest,
          | 'id'
          | 'createdAt'
          | 'updatedAt'
          | 'status'
          | 'provider'
          | 'providerMode'
          | 'authorizationUrl'
          | 'accessCode'
        >;
      }) => {
        saved = {
          ...data,
          id: 'funding1',
          status: 'INITIALIZING',
          provider: 'PAYSTACK',
          providerMode: 'test',
          authorizationUrl: null,
          accessCode: null,
          providerTransactionId: null,
          verifiedAt: null,
          lastCheckedAt: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        };
        return saved;
      },
    );
    fundingRequest.updateMany.mockImplementation(({ data }: { data: Partial<FundingRequest> }) => {
      if (saved?.status === 'INITIALIZING') saved = { ...saved, ...data };
      return { count: 1 };
    });
    initialize = jest.spyOn(paystack, 'initializePayment').mockImplementation((input) => {
      expect(saved?.reference).toBe(input.reference);
      expect(saved?.status).toBe('INITIALIZING');
      return Promise.resolve({
        authorizationUrl: 'https://checkout.paystack.com/test',
        accessCode: 'code',
      });
    });
  });
  afterEach(() => jest.restoreAllMocks());

  it('persists authenticated customer and exact minor units before checkout, then replays without another provider call', async () => {
    const result = await service.initialize('user1', '100.50', 'key');
    expect(initialize).toHaveBeenCalledWith({
      email: user.email,
      amountMinor: 10050n,
      currency: 'NGN',
      reference: expect.stringMatching(/^fund-[a-f0-9-]+$/) as string,
    });
    expect(result).toMatchObject({
      amount: '100.50',
      amountMinor: '10050',
      currency: 'NGN',
      status: 'PENDING',
    });
    expect(await service.initialize('user1', '100.50', 'key')).toEqual(result);
    expect(initialize).toHaveBeenCalledTimes(1);
    expect(fundingRequest.create).toHaveBeenCalledTimes(1);
  });

  it('rejects reuse for a different amount', async () => {
    await service.initialize('user1', '100', 'key');
    await expect(service.initialize('user1', '101', 'key')).rejects.toThrow(
      'different funding request',
    );
    expect(initialize).toHaveBeenCalledTimes(1);
  });

  it('preserves uncertain requests and blocks reinitialization', async () => {
    initialize.mockRejectedValue(new Error('timeout'));
    await expect(service.initialize('user1', '100', 'key')).rejects.toThrow('timeout');
    expect(saved?.status).toBe('INITIALIZATION_UNKNOWN');
    await expect(service.initialize('user1', '100', 'key')).rejects.toThrow(
      'in progress or uncertain',
    );
    expect(initialize).toHaveBeenCalledTimes(1);
  });

  it('blocks a retry while the first provider call is in flight', async () => {
    let finish!: (value: { authorizationUrl: string; accessCode: string }) => void;
    initialize.mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const first = service.initialize('user1', '100', 'key');
    // Wait until the provider call is reached, without advancing it.
    await new Promise<void>((resolve) => setImmediate(resolve));
    await expect(service.initialize('user1', '100', 'key')).rejects.toThrow(
      'in progress or uncertain',
    );
    finish({ authorizationUrl: 'https://checkout.paystack.com/test', accessCode: 'code' });
    await first;
    expect(initialize).toHaveBeenCalledTimes(1);
  });

  it.each(['', 'bad key'])('rejects invalid idempotency keys %s', async (key) => {
    await expect(service.initialize('user1', '100', key)).rejects.toThrow('x-idempotency-key');
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it.each(['0', '-1', '1.234', '90071992547409.92'])(
    'rejects invalid or unsafe amounts %s',
    async (amount) => {
      await expect(service.initialize('user1', amount, 'key')).rejects.toThrow();
      expect(initialize).not.toHaveBeenCalled();
    },
  );

  it.each([
    { ...user, isActive: false },
    { ...user, closedAt: new Date() },
    { ...user, wallet: null },
    { ...user, wallet: { ...wallet, closedAt: new Date() } },
    { ...user, wallet: { ...wallet, currency: 'USD' } },
  ])('rejects ineligible customer or wallet', async (value) => {
    tx.user.findUnique.mockResolvedValue(value);
    await expect(service.initialize('user1', '100', 'key')).rejects.toThrow();
    expect(fundingRequest.create).not.toHaveBeenCalled();
    expect(initialize).not.toHaveBeenCalled();
  });

  it('does not expose another customer’s request', async () => {
    const result = await service.initialize('user1', '100', 'key');
    await expect(service.get('someone-else', result.reference)).rejects.toThrow('not found');
  });

  it('creates no request while Paystack is disabled', async () => {
    jest.spyOn(paystack, 'assertEnabled').mockImplementation(() => {
      throw new Error('disabled');
    });
    await expect(service.initialize('user1', '100', 'key')).rejects.toThrow('disabled');
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});
