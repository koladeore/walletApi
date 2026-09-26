import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { UsersService } from './users.service';
import { PrismaService } from '../prisma/prisma.service';
import { EmailService } from '../email/email.service';

describe('Admin account status changes', () => {
  let service: UsersService;
  const tx = {
    $queryRaw: jest.fn(),
    user: { findUnique: jest.fn(), update: jest.fn() },
    authToken: { updateMany: jest.fn() },
    auditLog: { create: jest.fn() },
  };
  const transaction = jest.fn();
  beforeEach(async () => {
    jest.resetAllMocks();
    tx.user.findUnique
      .mockResolvedValueOnce({ id: 'admin', role: 'ADMIN', isActive: true })
      .mockResolvedValueOnce({ id: 'target', isActive: true });
    tx.user.update.mockResolvedValue({ id: 'target', isActive: false });
    transaction.mockImplementation((fn: (client: typeof tx) => Promise<unknown>) => fn(tx));
    const module = await Test.createTestingModule({
      providers: [
        UsersService,
        { provide: PrismaService, useValue: { $transaction: transaction } },
        { provide: EmailService, useValue: {} },
      ],
    }).compile();
    service = module.get(UsersService);
  });
  it('deactivates, invalidates sessions, and audits in one transaction', async () => {
    await service.updateStatus('admin', 'target', { isActive: false, reason: 'Review' });
    expect(tx.user.update).toHaveBeenCalledWith({
      where: { id: 'target' },
      data: { isActive: false, authVersion: { increment: 1 } },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
      },
    });
    expect(tx.authToken.updateMany).toHaveBeenCalledWith({
      where: { userId: 'target', isRevoked: false },
      data: { isRevoked: true },
    });
    expect(tx.auditLog.create).toHaveBeenCalledWith({
      data: {
        userId: 'admin',
        action: 'USER_STATUS_UPDATED',
        metadata: {
          targetUserId: 'target',
          previousIsActive: true,
          isActive: false,
          reason: 'Review',
        },
      },
    });
  });
  it('reactivates with a new session version', async () => {
    tx.user.findUnique
      .mockReset()
      .mockResolvedValueOnce({ role: 'ADMIN', isActive: true })
      .mockResolvedValueOnce({ isActive: false });
    await service.updateStatus('admin', 'target', { isActive: true, reason: 'Resolved' });
    expect(tx.user.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { isActive: true, authVersion: { increment: 1 } } }),
    );
    expect(tx.authToken.updateMany).toHaveBeenCalledTimes(1);
  });
  it('prevents self-deactivation before writing', async () => {
    await expect(
      service.updateStatus('admin', 'admin', { isActive: false, reason: 'Review' }),
    ).rejects.toThrow(BadRequestException);
    expect(transaction).not.toHaveBeenCalled();
  });
  it('rejects a missing target', async () => {
    tx.user.findUnique
      .mockReset()
      .mockResolvedValueOnce({ role: 'ADMIN', isActive: true })
      .mockResolvedValueOnce(null);
    await expect(
      service.updateStatus('admin', 'missing', { isActive: false, reason: 'Review' }),
    ).rejects.toThrow(NotFoundException);
    expect(tx.user.update).not.toHaveBeenCalled();
  });
  it('rechecks admin privileges inside the transaction', async () => {
    tx.user.findUnique.mockReset().mockResolvedValueOnce({ role: 'USER', isActive: true });
    await expect(
      service.updateStatus('admin', 'target', { isActive: false, reason: 'Review' }),
    ).rejects.toThrow(ForbiddenException);
    expect(tx.user.update).not.toHaveBeenCalled();
  });
  it('fails the transaction if auditing fails', async () => {
    tx.auditLog.create.mockRejectedValue(new Error('Audit unavailable'));
    await expect(
      service.updateStatus('admin', 'target', { isActive: false, reason: 'Review' }),
    ).rejects.toThrow('Audit unavailable');
  });
});
