import { createHash } from 'node:crypto';
import {
  MAX_MINOR,
  parseNaira,
  formatMinor,
  walletResponse,
  transactionResponse,
} from '../common/money/money';
import {
  Injectable,
  BadRequestException,
  ConflictException,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma } from '@prisma/client';
import { TransactionHistoryQueryDto } from './dto/transaction-history-query.dto';
import { EmailService } from '../email/email.service';
import { NotificationService } from '../notification/notification.service';

// Persist the HTTP representation: dates become ISO strings, monetary values are
// already strings. This makes first responses and replay responses identical.
type Wire<T> = T extends Date ? string : T extends object ? { [K in keyof T]: Wire<T[K]> } : T;

@Injectable()
export class WalletService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly emailService: EmailService,
    private readonly notificationService: NotificationService,
    private readonly configService: ConfigService,
  ) {}

  private validateKey(key: string) {
    if (typeof key !== 'string' || !/^[A-Za-z0-9._:-]{1,200}$/.test(key))
      throw new BadRequestException(
        'Idempotency key must contain 1–200 letters, digits, dots, underscores, colons or hyphens',
      );
  }

  private async idempotent<T>(
    key: string,
    request: readonly string[],
    perform: (tx: Prisma.TransactionClient) => Promise<T>,
  ): Promise<{ value: Wire<T>; replayed: boolean }> {
    this.validateKey(key);
    const fingerprint = createHash('sha256').update(JSON.stringify(request)).digest('hex');
    return this.prisma.$transaction(
      async (tx) => {
        // Every request takes this lock before any wallet locks. Hash collisions only
        // serialize unrelated requests; the table still compares the full key.
        await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`wallet-request:${key}`}, 0))::text`;
        const saved = await tx.walletRequest.findUnique({ where: { key } });
        if (saved) {
          if (saved.fingerprint !== fingerprint)
            throw new ConflictException('Idempotency key was used for a different request');
          return { value: saved.response as Wire<T>, replayed: true };
        }
        // Old transactions lack a response snapshot. Never repeat them or disclose
        // another user's result. The caller can reconcile through transaction history.
        if (await tx.transaction.findUnique({ where: { referenceId: key } }))
          throw new ConflictException('This reference already exists; check transaction history');
        const value = JSON.parse(JSON.stringify(await perform(tx))) as Wire<T>;
        await tx.walletRequest.create({
          data: { key, fingerprint, response: value as Prisma.InputJsonValue },
        });
        return { value, replayed: false };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted },
    );
  }

  /**
   * Simulate funding the wallet
   */
  async fundWallet(userId: string, amount: string, idempotencyKey: string) {
    const environment = this.configService.get<string>('NODE_ENV');
    const simulationEnabled = this.configService.get<string>('ENABLE_SIMULATED_FUNDING') === 'true';

    // Fail closed, including when NODE_ENV is missing or unrecognized.
    // Enforce this in the service so other callers cannot bypass the controller.
    if (!simulationEnabled || (environment !== 'development' && environment !== 'test')) {
      throw new ForbiddenException('Simulated wallet funding is disabled');
    }

    const amountMinor = parseNaira(amount);
    try {
      const result = await this.idempotent(
        idempotencyKey,
        ['fund', userId, 'NGN', amountMinor.toString()],
        async (tx) => {
          // Find the user's wallet
          const wallet = await tx.wallet.findUnique({
            where: { userId },
          });

          if (!wallet) {
            throw new NotFoundException('Wallet not found');
          }

          // Lock the wallet row for update
          await tx.$queryRaw`SELECT id FROM wallets WHERE id = ${wallet.id} FOR UPDATE`;

          const current = await tx.wallet.findUniqueOrThrow({ where: { id: wallet.id } });
          if (current.closedAt) throw new ConflictException('Wallet is closed');
          if (current.currency !== 'NGN')
            throw new BadRequestException('Only NGN wallets are supported');
          if (current.balanceMinor + amountMinor > MAX_MINOR)
            throw new BadRequestException('Wallet balance limit exceeded');

          // Create transaction record FIRST to utilize the DB unique constraint on idempotencyKey
          const transaction = await tx.transaction.create({
            data: {
              amountMinor,
              currency: 'NGN',
              type: 'CREDIT',
              status: 'SUCCESS',
              referenceId: idempotencyKey, // Idempotency
              receiverWalletId: wallet.id,
              metadata: { description: 'Wallet Funding', fundingSource: 'SIMULATION' },
            },
          });

          // Add funds to wallet
          const updatedWallet = await tx.wallet.update({
            where: { id: wallet.id },
            data: {
              balanceMinor: {
                increment: amountMinor,
              },
            },
          });

          return {
            wallet: walletResponse(updatedWallet),
            transaction: transactionResponse(transaction),
          };
        },
      );
      return result.value;
    } catch (error: unknown) {
      // Prisma unique constraint error code (P2002) for duplicate referenceId (idempotency key)
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException(
          'A transaction with this idempotency key has already been processed',
        );
      }
      throw error;
    }
  }

  /**
   * Transfer funds from one user to another
   */
  async transferFunds(
    senderId: string,
    receiverEmail: string,
    amount: string,
    idempotencyKey: string,
  ) {
    const amountMinor = parseNaira(amount);

    try {
      const execution = await this.idempotent(
        idempotencyKey,
        ['transfer', senderId, receiverEmail, 'NGN', amountMinor.toString()],
        async (tx) => {
          // Get sender profile and wallet
          const sender = await tx.user.findUnique({
            where: { id: senderId },
            include: { wallet: true },
          });

          if (!sender || !sender.wallet) {
            throw new NotFoundException('Sender wallet not found');
          }

          // Get receiver profile and wallet
          const receiver = await tx.user.findUnique({
            where: { email: receiverEmail },
            include: { wallet: true },
          });

          if (!receiver || !receiver.wallet) {
            throw new NotFoundException('Receiver wallet not found for the provided email');
          }

          if (sender.id === receiver.id) {
            throw new BadRequestException('Cannot transfer funds to yourself');
          }

          const senderWallet = sender.wallet;
          const receiverWallet = receiver.wallet;

          if (senderWallet.currency !== 'NGN' || receiverWallet.currency !== 'NGN') {
            throw new BadRequestException('Both wallets must use NGN');
          }

          // Ensure predictable locking order to avoid deadlocks (lock smaller ID first)
          const firstLockId =
            senderWallet.id < receiverWallet.id ? senderWallet.id : receiverWallet.id;
          const secondLockId =
            senderWallet.id < receiverWallet.id ? receiverWallet.id : senderWallet.id;

          // Lock wallets rows mapping FOR UPDATE
          await tx.$queryRaw`SELECT id FROM wallets WHERE id = ${firstLockId} FOR UPDATE`;
          await tx.$queryRaw`SELECT id FROM wallets WHERE id = ${secondLockId} FOR UPDATE`;

          // Check sufficient balance
          const freshSenderWallet = await tx.wallet.findUnique({ where: { id: senderWallet.id } });
          if (
            !freshSenderWallet ||
            freshSenderWallet.balanceMinor - freshSenderWallet.reservedMinor < amountMinor
          ) {
            throw new BadRequestException('Insufficient balance');
          }

          const freshReceiver = await tx.wallet.findUniqueOrThrow({
            where: { id: receiverWallet.id },
          });
          if (freshSenderWallet.closedAt || freshReceiver.closedAt)
            throw new ConflictException('Wallet is closed');
          if (freshSenderWallet.currency !== 'NGN' || freshReceiver.currency !== 'NGN') {
            throw new BadRequestException('Both wallets must use NGN');
          }
          if (freshReceiver.balanceMinor + amountMinor > MAX_MINOR)
            throw new BadRequestException('Recipient balance limit exceeded');

          // Create transaction history with Idempotency constraint on referenceId
          const transactionRecord = await tx.transaction.create({
            data: {
              amountMinor,
              currency: 'NGN',
              type: 'TRANSFER',
              status: 'SUCCESS',
              referenceId: idempotencyKey, // Handles Idempotency
              senderWalletId: senderWallet.id,
              receiverWalletId: receiverWallet.id,
              metadata: { description: `Transfer to ${receiver.email}` },
            },
          });

          // Debit sender
          await tx.wallet.update({
            where: { id: senderWallet.id },
            data: {
              balanceMinor: {
                decrement: amountMinor,
              },
            },
          });

          // Credit receiver
          await tx.wallet.update({
            where: { id: receiverWallet.id },
            data: {
              balanceMinor: {
                increment: amountMinor,
              },
            },
          });

          return {
            transactionRecord: transactionResponse(transactionRecord),
            senderEmail: sender.email,
            receiverEmail: receiver.email,
            receiverId: receiver.id,
          };
        },
      );

      const result = execution.value;
      if (execution.replayed) return result.transactionRecord;

      // Fire off background jobs
      this.emailService
        .sendTransferReceipt(result.senderEmail, formatMinor(amountMinor), result.receiverEmail)
        .catch(console.error);
      this.emailService
        .sendTransferReceivedEmail(
          result.receiverEmail,
          formatMinor(amountMinor),
          result.senderEmail,
        )
        .catch(console.error);
      this.notificationService
        .notifyTransferReceived(result.receiverId, formatMinor(amountMinor), result.senderEmail)
        .catch(console.error);

      return result.transactionRecord;
    } catch (error: unknown) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException(
          'A transaction with this idempotency key has already been processed',
        );
      }
      throw error;
    }
  }

  async reverseTransaction(actorId: string, transactionId: string, reason: string, key: string) {
    if (typeof reason !== 'string' || !reason.trim() || reason.trim().length > 500)
      throw new BadRequestException('A reason of 1–500 characters is required');
    reason = reason.trim();
    const actor = await this.prisma.user.findUnique({ where: { id: actorId } });
    if (!actor?.isActive || actor.closedAt || actor.role !== 'ADMIN')
      throw new ForbiddenException();
    const result = await this.idempotent(
      key,
      ['reversal', actorId, transactionId, reason],
      async (tx) => {
        await tx.$queryRaw`SELECT id FROM users WHERE id = ${actorId} FOR UPDATE`;
        const admin = await tx.user.findUniqueOrThrow({ where: { id: actorId } });
        if (!admin.isActive || admin.closedAt || admin.role !== 'ADMIN')
          throw new ForbiddenException();
        await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`reversal:${transactionId}`}, 0))::text`;
        const original = await tx.transaction.findUnique({
          where: { id: transactionId },
          include: { ledgerJournal: true, reversal: true },
        });
        if (!original) throw new NotFoundException('Transaction not found');
        if (original.reversal) throw new ConflictException('Transaction already reversed');
        if (
          original.status !== 'SUCCESS' ||
          original.reversalOfId ||
          !original.ledgerJournal ||
          original.type === 'DEBIT'
        )
          throw new BadRequestException(
            'Only posted internal transfers and funding can be reversed; withdrawals require provider reconciliation',
          );
        const ids = [original.senderWalletId, original.receiverWalletId]
          .filter((id): id is string => id !== null)
          .sort();
        for (const id of ids)
          await tx.$queryRaw`SELECT id FROM wallets WHERE id = ${id} FOR UPDATE`;
        if (!original.receiverWalletId)
          throw new BadRequestException('Original credit wallet is missing');
        const debit = await tx.wallet.findUniqueOrThrow({
          where: { id: original.receiverWalletId },
        });
        if (debit.closedAt) throw new ConflictException('Cannot reverse through a closed wallet');
        if (debit.balanceMinor - debit.reservedMinor < original.amountMinor)
          throw new BadRequestException('Insufficient available balance to reverse');
        if (original.senderWalletId) {
          const credit = await tx.wallet.findUniqueOrThrow({
            where: { id: original.senderWalletId },
          });
          if (credit.closedAt)
            throw new ConflictException('Cannot reverse through a closed wallet');
          if (credit.balanceMinor + original.amountMinor > MAX_MINOR)
            throw new BadRequestException('Wallet balance limit exceeded');
          await tx.wallet.update({
            where: { id: credit.id },
            data: { balanceMinor: { increment: original.amountMinor } },
          });
        }
        await tx.wallet.update({
          where: { id: debit.id },
          data: { balanceMinor: { decrement: original.amountMinor } },
        });
        const reversal = await tx.transaction.create({
          data: {
            reversalOfId: original.id,
            amountMinor: original.amountMinor,
            currency: original.currency,
            type: original.type === 'TRANSFER' ? 'TRANSFER' : 'DEBIT',
            status: 'SUCCESS',
            referenceId: key,
            senderWalletId: original.receiverWalletId,
            receiverWalletId: original.senderWalletId,
            metadata: { reason, actorId },
          },
        });
        await tx.auditLog.create({
          data: {
            userId: actorId,
            action: 'TRANSACTION_REVERSED',
            metadata: {
              originalTransactionId: original.id,
              reversalTransactionId: reversal.id,
              reason,
            },
          },
        });
        return transactionResponse(reversal);
      },
    );
    return result.value;
  }

  // Internal payout orchestration only. Never expose capture/release to customers:
  // release requires a definitive payout failure; capture requires verified success.
  async reserveWithdrawal(userId: string, amount: string, reference: string) {
    const amountMinor = parseNaira(amount);
    this.validateKey(reference);
    return this.prisma.$transaction(async (tx) => {
      // Serialize global reference collisions before taking the wallet lock.
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`withdrawal:${reference}`}, 0))::text`;
      const wallet = await tx.wallet.findUniqueOrThrow({ where: { userId } });
      await tx.$queryRaw`SELECT id FROM wallets WHERE id = ${wallet.id} FOR UPDATE`;
      const existing = await tx.withdrawalReservation.findUnique({ where: { reference } });
      if (existing) {
        if (existing.walletId !== wallet.id || existing.amountMinor !== amountMinor)
          throw new ConflictException('Withdrawal reference already used');
        return transactionResponse(existing);
      }
      const current = await tx.wallet.findUniqueOrThrow({ where: { id: wallet.id } });
      if (current.closedAt) throw new ConflictException('Wallet is closed');
      if (current.currency !== 'NGN')
        throw new BadRequestException('Only NGN wallets are supported');
      if (current.balanceMinor - current.reservedMinor < amountMinor)
        throw new BadRequestException('Insufficient available balance');
      const reservation = await tx.withdrawalReservation.create({
        data: { walletId: wallet.id, currency: current.currency, amountMinor, reference },
      });
      return transactionResponse(reservation);
    });
  }

  async resolveWithdrawal(reference: string, outcome: 'CAPTURED' | 'RELEASED') {
    if (outcome !== 'CAPTURED' && outcome !== 'RELEASED')
      throw new BadRequestException('Invalid withdrawal outcome');
    return this.prisma.$transaction(async (tx) => {
      const reservation = await tx.withdrawalReservation.findUniqueOrThrow({
        where: { reference },
      });
      await tx.$queryRaw`SELECT id FROM wallets WHERE id = ${reservation.walletId} FOR UPDATE`;
      const current = await tx.withdrawalReservation.findUniqueOrThrow({ where: { reference } });
      if (current.status === outcome) return transactionResponse(current);
      if (current.status !== 'PENDING') throw new ConflictException('Withdrawal already resolved');
      return transactionResponse(
        await tx.withdrawalReservation.update({
          where: { reference },
          data: { status: outcome },
        }),
      );
    });
  }

  /**
   * Get transaction history for a user with pagination and filters
   */
  async getTransactionHistory(userId: string, query: TransactionHistoryQueryDto) {
    const { page = 1, limit = 10, type, startDate, endDate } = query;
    const skip = (page - 1) * limit;

    // Find the user's wallet first
    const wallet = await this.prisma.wallet.findUnique({
      where: { userId },
    });

    if (!wallet) {
      throw new NotFoundException('Wallet not found');
    }

    // Build the dynamic where clause
    const where: Prisma.TransactionWhereInput = {
      OR: [{ senderWalletId: wallet.id }, { receiverWalletId: wallet.id }],
    };

    if (type) {
      where.type = type;
    }

    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) {
        where.createdAt.gte = new Date(startDate);
      }
      if (endDate) {
        where.createdAt.lte = new Date(endDate);
      }
    }

    // Execute query and count in parallel
    const [transactions, totalItems] = await Promise.all([
      this.prisma.transaction.findMany({
        where,
        take: limit,
        skip,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.transaction.count({ where }),
    ]);

    return {
      data: transactions.map(transactionResponse),
      meta: {
        totalItems,
        itemCount: transactions.length,
        itemsPerPage: limit,
        totalPages: Math.ceil(totalItems / limit),
        currentPage: page,
      },
    };
  }
}
