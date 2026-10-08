import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiHeader, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import type { AuthenticatedRequest } from '../common/types/authenticated-request';
import { FundWalletDto } from '../wallet/dto/fund-wallet.dto';
import { FundingService } from './funding.service';
import { ConfirmationService } from './confirmation.service';

@ApiTags('wallet')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('wallet/funding')
export class FundingController {
  constructor(
    private readonly funding: FundingService,
    private readonly confirmation: ConfirmationService,
  ) {}

  @Post(':reference/verify')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Verify your payment with Paystack and credit a matching successful payment once',
  })
  async verify(@Req() req: AuthenticatedRequest, @Param('reference') reference: string) {
    await this.confirmation.confirm(reference, req.user.id);
    return this.funding.get(req.user.id, reference);
  }

  @Post('initialize')
  @ApiOperation({ summary: 'Initialize Paystack test checkout; does not credit the wallet' })
  @ApiHeader({
    name: 'x-idempotency-key',
    required: true,
    description: 'Reuse the same key for retries of the same funding request.',
  })
  initialize(
    @Req() req: AuthenticatedRequest,
    @Body() dto: FundWalletDto,
    @Headers('x-idempotency-key') key: string,
  ) {
    return this.funding.initialize(req.user.id, dto.amount, key);
  }

  @Get(':reference')
  @ApiOperation({
    summary: 'Read your stored funding request status (not live provider verification)',
  })
  get(@Req() req: AuthenticatedRequest, @Param('reference') reference: string) {
    return this.funding.get(req.user.id, reference);
  }
}
