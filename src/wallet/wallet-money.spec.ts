import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { WalletService } from './wallet.service';
import { PrismaService } from '../prisma/prisma.service';
import { EmailService } from '../email/email.service';
import { NotificationService } from '../notification/notification.service';
import { MAX_MINOR } from '../common/money/money';

describe('Integer wallet transfers', () => {
  let service: WalletService;
  const tx = {
    user: { findUnique: jest.fn() },
    wallet: { findUnique: jest.fn(), findUniqueOrThrow: jest.fn(), update: jest.fn() },
    transaction: { create: jest.fn() },
    $queryRaw: jest.fn(),
  };
  const send = jest.fn();
  beforeEach(async () => {
    jest.resetAllMocks();
    tx.user.findUnique
      .mockResolvedValueOnce({
        id: 'sender',
        email: 's@example.com',
        wallet: { id: 'a', currency: 'NGN' },
      })
      .mockResolvedValueOnce({
        id: 'receiver',
        email: 'r@example.com',
        wallet: { id: 'b', currency: 'NGN' },
      });
    tx.wallet.findUnique.mockResolvedValue({
      reservedMinor: 0n,
      balanceMinor: 9007199254740993n,
      currency: 'NGN',
    });
    tx.wallet.findUniqueOrThrow.mockResolvedValue({
      reservedMinor: 0n,
      balanceMinor: 0n,
      currency: 'NGN',
    });
    tx.transaction.create.mockResolvedValue({
      id: 'tx',
      amountMinor: 9007199254740993n,
      currency: 'NGN',
    });
    send.mockResolvedValue(undefined);
    const module = await Test.createTestingModule({
      providers: [
        WalletService,
        {
          provide: PrismaService,
          useValue: { $transaction: (fn: (client: typeof tx) => Promise<unknown>) => fn(tx) },
        },
        {
          provide: EmailService,
          useValue: { sendTransferReceipt: send, sendTransferReceivedEmail: send },
        },
        { provide: NotificationService, useValue: { notifyTransferReceived: send } },
        { provide: ConfigService, useValue: {} },
      ],
    }).compile();
    service = module.get(WalletService);
  });
  it('moves an exact amount above Number.MAX_SAFE_INTEGER and returns JSON-safe strings', async () => {
    const result = await service.transferFunds(
      'sender',
      'r@example.com',
      '90071992547409.93',
      'key',
    );
    expect(tx.wallet.update).toHaveBeenNthCalledWith(1, {
      where: { id: 'a' },
      data: { balanceMinor: { decrement: 9007199254740993n } },
    });
    expect(tx.wallet.update).toHaveBeenNthCalledWith(2, {
      where: { id: 'b' },
      data: { balanceMinor: { increment: 9007199254740993n } },
    });
    expect(result.amountMinor).toBe('9007199254740993');
    expect(() => JSON.stringify(result)).not.toThrow();
    expect(send).toHaveBeenCalledWith('s@example.com', '90071992547409.93', 'r@example.com');
  });
  it('rejects a one-kobo shortfall at a large balance', async () => {
    tx.wallet.findUnique.mockResolvedValue({
      reservedMinor: 0n,
      balanceMinor: 9007199254740992n,
      currency: 'NGN',
    });
    await expect(
      service.transferFunds('sender', 'r@example.com', '90071992547409.93', 'key'),
    ).rejects.toThrow('Insufficient balance');
    expect(tx.wallet.update).not.toHaveBeenCalled();
  });
  it('does not spend money reserved for a withdrawal', async () => {
    tx.wallet.findUnique.mockResolvedValue({
      balanceMinor: 10000n,
      reservedMinor: 7000n,
      currency: 'NGN',
    });
    await expect(service.transferFunds('sender', 'r@example.com', '30.01', 'key')).rejects.toThrow(
      'Insufficient balance',
    );
    expect(tx.transaction.create).not.toHaveBeenCalled();
  });
  it('rejects recipient balance overflow before writes', async () => {
    tx.wallet.findUniqueOrThrow.mockResolvedValue({
      reservedMinor: 0n,
      balanceMinor: MAX_MINOR,
      currency: 'NGN',
    });
    await expect(service.transferFunds('sender', 'r@example.com', '0.01', 'key')).rejects.toThrow(
      'Recipient balance limit exceeded',
    );
    expect(tx.wallet.update).not.toHaveBeenCalled();
  });
  it('rejects legacy USD wallets rather than treating dollars as naira', async () => {
    tx.user.findUnique
      .mockReset()
      .mockResolvedValueOnce({ id: 'sender', wallet: { id: 'a', currency: 'USD' } })
      .mockResolvedValueOnce({ id: 'receiver', wallet: { id: 'b', currency: 'NGN' } });
    await expect(service.transferFunds('sender', 'r@example.com', '1', 'key')).rejects.toThrow(
      'Both wallets must use NGN',
    );
    expect(tx.wallet.update).not.toHaveBeenCalled();
  });
  it.each(['sender', 'receiver'])('rechecks %s currency after obtaining locks', async (side) => {
    if (side === 'sender') {
      tx.wallet.findUnique.mockResolvedValue({
        reservedMinor: 0n,
        balanceMinor: 100n,
        currency: 'USD',
      });
    } else {
      tx.wallet.findUniqueOrThrow.mockResolvedValue({
        reservedMinor: 0n,
        balanceMinor: 0n,
        currency: 'USD',
      });
    }
    await expect(service.transferFunds('sender', 'r@example.com', '0.01', 'key')).rejects.toThrow(
      'Both wallets must use NGN',
    );
    expect(tx.transaction.create).not.toHaveBeenCalled();
    expect(tx.wallet.update).not.toHaveBeenCalled();
  });
});
