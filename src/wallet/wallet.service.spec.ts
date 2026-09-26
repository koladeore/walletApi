import { ForbiddenException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service';
import { EmailService } from '../email/email.service';
import { NotificationService } from '../notification/notification.service';
import { WalletService } from './wallet.service';

describe('WalletService simulated funding', () => {
  const transaction = jest.fn();
  let service: WalletService;
  let settings: Record<string, string | undefined>;

  beforeEach(async () => {
    transaction.mockReset();
    settings = {};
    const module = await Test.createTestingModule({
      providers: [
        WalletService,
        { provide: PrismaService, useValue: { $transaction: transaction } },
        { provide: EmailService, useValue: {} },
        { provide: NotificationService, useValue: {} },
        { provide: ConfigService, useValue: { get: (key: string) => settings[key] } },
      ],
    }).compile();
    service = module.get(WalletService);
  });

  it.each([
    [undefined, undefined],
    [undefined, 'true'],
    ['production', undefined],
    ['production', 'true'],
    ['staging', 'true'],
    ['preview', 'true'],
    ['development', undefined],
    ['test', undefined],
    ['development', 'false'],
    ['test', 'false'],
    ['development', 'TRUE'],
    ['test', '1'],
  ])(
    'blocks funding with NODE_ENV=%s and opt-in=%s before any database write',
    async (env, flag) => {
      settings.NODE_ENV = env;
      settings.ENABLE_SIMULATED_FUNDING = flag;

      await expect(service.fundWallet('user-id', 100, 'request-id')).rejects.toThrow(
        ForbiddenException,
      );
      expect(transaction).not.toHaveBeenCalled();
    },
  );

  it.each(['development', 'test'])('allows explicitly enabled simulation in %s', async (env) => {
    settings.NODE_ENV = env;
    settings.ENABLE_SIMULATED_FUNDING = 'true';
    const tx = {
      wallet: {
        findUnique: jest.fn().mockResolvedValue({ id: 'wallet-id' }),
        update: jest.fn().mockResolvedValue({ id: 'wallet-id', balance: 100 }),
      },
      $queryRaw: jest.fn().mockResolvedValue([]),
      transaction: { create: jest.fn().mockResolvedValue({ id: 'transaction-id' }) },
    };
    transaction.mockImplementation((callback: (client: typeof tx) => Promise<unknown>) =>
      callback(tx),
    );

    await expect(service.fundWallet('user-id', 100, 'request-id')).resolves.toEqual({
      wallet: { id: 'wallet-id', balance: 100 },
      transaction: { id: 'transaction-id' },
    });
    expect(tx.wallet.update).toHaveBeenCalledWith({
      where: { id: 'wallet-id' },
      data: { balance: { increment: 100 } },
    });
  });
});
