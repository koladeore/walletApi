import {
  Controller,
  Post,
  Get,
  Query,
  Body,
  UseGuards,
  Req,
  Headers,
  BadRequestException,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiHeader } from '@nestjs/swagger';
import { WalletService } from './wallet.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { FundWalletDto } from './dto/fund-wallet.dto';
import { TransferDto } from './dto/transfer.dto';
import { TransactionHistoryQueryDto } from './dto/transaction-history-query.dto';
import type { AuthenticatedRequest } from '../common/types/authenticated-request';

@ApiTags('wallet')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('wallet')
export class WalletController {
  constructor(private readonly walletService: WalletService) {}

  @Post('fund')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Simulate funding the wallet (development/test only)',
    description:
      'Disabled by default. Requires explicit opt-in in a development or test environment.',
  })
  @ApiHeader({
    name: 'x-idempotency-key',
    description: 'Unique key to prevent duplicate funding attempts',
    required: true,
  })
  @ApiResponse({ status: 200, description: 'Wallet funded successfully.' })
  @ApiResponse({ status: 403, description: 'Simulated wallet funding is disabled.' })
  @ApiResponse({ status: 409, description: 'Conflict - Idempotency key already used.' })
  async fundWallet(
    @Req() req: AuthenticatedRequest,
    @Body() dto: FundWalletDto,
    @Headers('x-idempotency-key') idempotencyKey: string,
  ) {
    if (!idempotencyKey) {
      throw new BadRequestException('x-idempotency-key header is required');
    }
    return this.walletService.fundWallet(req.user.id, dto.amount, idempotencyKey);
  }

  @Post('transfer')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Transfer funds to another user' })
  @ApiHeader({
    name: 'x-idempotency-key',
    description: 'Unique key to prevent duplicate transfers',
    required: true,
  })
  @ApiResponse({ status: 200, description: 'Funds transferred successfully.' })
  @ApiResponse({ status: 400, description: 'Bad Request - Insufficient balance.' })
  @ApiResponse({ status: 404, description: 'Not Found - Receiver wallet not found.' })
  @ApiResponse({ status: 409, description: 'Conflict - Idempotency key already used.' })
  async transfer(
    @Req() req: AuthenticatedRequest,
    @Body() dto: TransferDto,
    @Headers('x-idempotency-key') idempotencyKey: string,
  ) {
    if (!idempotencyKey) {
      throw new BadRequestException('x-idempotency-key header is required');
    }
    return this.walletService.transferFunds(
      req.user.id,
      dto.receiverEmail,
      dto.amount,
      idempotencyKey,
    );
  }

  @Get('transactions')
  @ApiOperation({ summary: 'Get transaction history with pagination and filters' })
  @ApiResponse({ status: 200, description: 'Successfully retrieved transaction history.' })
  async getTransactions(
    @Req() req: AuthenticatedRequest,
    @Query() query: TransactionHistoryQueryDto,
  ) {
    return this.walletService.getTransactionHistory(req.user.id, query);
  }
}
