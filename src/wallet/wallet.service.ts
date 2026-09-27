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

@Injectable()
export class WalletService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly emailService: EmailService,
    private readonly notificationService: NotificationService,
    private readonly configService: ConfigService,
  ) {}

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

        const current = await tx.wallet.findUniqueOrThrow({ where: { id: wallet.id } });
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
            metadata: { description: 'Wallet Funding' },
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
      });
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
        if (!freshSenderWallet || freshSenderWallet.balanceMinor < amountMinor) {
          throw new BadRequestException('Insufficient balance');
        }

        const freshReceiver = await tx.wallet.findUniqueOrThrow({
          where: { id: receiverWallet.id },
        });
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
          transactionRecord,
          senderEmail: sender.email,
          receiverEmail: receiver.email,
          receiverId: receiver.id,
        };
      });

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

      return transactionResponse(result.transactionRecord);
    } catch (error: unknown) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException(
          'A transaction with this idempotency key has already been processed',
        );
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
