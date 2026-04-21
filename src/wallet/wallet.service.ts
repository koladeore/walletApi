import { Injectable, BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma } from '@prisma/client';
import { TransactionHistoryQueryDto } from './dto/transaction-history-query.dto';
import { EmailService } from '../email/email.service';
import { NotificationService } from '../notification/notification.service';

@Injectable()
export class WalletService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly emailService: EmailService,
    private readonly notificationService: NotificationService,
  ) {}

  /**
   * Simulate funding the wallet
   */
  async fundWallet(userId: string, amount: number, idempotencyKey: string) {
    try {
      return await this.prisma.$transaction(async (tx) => {
        // Find the user's wallet
        const wallet = await tx.wallet.findUnique({
          where: { userId },
        });

        if (!wallet) {
          throw new NotFoundException('Wallet not found');
        }

        // Lock the wallet row for update
        await tx.$queryRaw`SELECT id FROM wallets WHERE id = ${wallet.id} FOR UPDATE`;

        // Create transaction record FIRST to utilize the DB unique constraint on idempotencyKey
        const transaction = await tx.transaction.create({
          data: {
            amount,
            type: 'CREDIT',
            status: 'SUCCESS',
            referenceId: idempotencyKey, // Idempotency
            receiverWalletId: wallet.id,
            metadata: { description: 'Wallet Funding' },
          },
        });

        // Add funds to wallet
        const updatedWallet = await tx.wallet.update({
          where: { id: wallet.id },
          data: {
            balance: {
              increment: amount,
            },
          },
        });

        return { wallet: updatedWallet, transaction };
      });
    } catch (error: any) {
      // Prisma unique constraint error code (P2002) for duplicate referenceId (idempotency key)
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('A transaction with this idempotency key has already been processed');
      }
      throw error;
    }
  }

  /**
   * Transfer funds from one user to another
   */
  async transferFunds(senderId: string, receiverEmail: string, amount: number, idempotencyKey: string) {
    if (amount <= 0) {
      throw new BadRequestException('Transfer amount must be greater than zero');
    }

    try {
      const result = await this.prisma.$transaction(async (tx) => {
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

        // Ensure predictable locking order to avoid deadlocks (lock smaller ID first)
        const firstLockId = senderWallet.id < receiverWallet.id ? senderWallet.id : receiverWallet.id;
        const secondLockId = senderWallet.id < receiverWallet.id ? receiverWallet.id : senderWallet.id;

        // Lock wallets rows mapping FOR UPDATE
        await tx.$queryRaw`SELECT id FROM wallets WHERE id = ${firstLockId} FOR UPDATE`;
        await tx.$queryRaw`SELECT id FROM wallets WHERE id = ${secondLockId} FOR UPDATE`;

        // Check sufficient balance
        const freshSenderWallet = await tx.wallet.findUnique({ where: { id: senderWallet.id } });
        if (!freshSenderWallet || Number(freshSenderWallet.balance) < amount) {
          throw new BadRequestException('Insufficient balance');
        }

        // Create transaction history with Idempotency constraint on referenceId
        const transactionRecord = await tx.transaction.create({
          data: {
            amount,
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
            balance: {
              decrement: amount,
            },
          },
        });

        // Credit receiver
        await tx.wallet.update({
          where: { id: receiverWallet.id },
          data: {
            balance: {
              increment: amount,
            },
          },
        });

        return {
          transactionRecord,
          senderEmail: sender.email,
          receiverEmail: receiver.email,
          receiverId: receiver.id,
        };
      });

      // Fire off background jobs
      this.emailService.sendTransferReceipt(result.senderEmail, amount, result.receiverEmail).catch(console.error);
      this.emailService.sendTransferReceivedEmail(result.receiverEmail, amount, result.senderEmail).catch(console.error);
      this.notificationService.notifyTransferReceived(result.receiverId, amount, result.senderEmail).catch(console.error);

      return result.transactionRecord;
    } catch (error: any) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('A transaction with this idempotency key has already been processed');
      }
      throw error;
    }
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
      OR: [
        { senderWalletId: wallet.id },
        { receiverWalletId: wallet.id },
      ],
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
      data: transactions,
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
