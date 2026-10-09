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
import { PayoutDto } from './payout.dto';
import { PayoutsService } from './payouts.service';

@ApiTags('payouts')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('wallet/payouts')
export class PayoutsController {
  constructor(private readonly payouts: PayoutsService) {}
  @Post()
  @ApiHeader({ name: 'x-idempotency-key', required: true })
  @ApiOperation({ summary: 'Reserve funds and request a Paystack test payout' })
  create(
    @Req() req: AuthenticatedRequest,
    @Body() dto: PayoutDto,
    @Headers('x-idempotency-key') key: string,
  ) {
    return this.payouts.create(req.user.id, dto.beneficiaryId, dto.amount, key);
  }
  @Get()
  @ApiOperation({ summary: 'List your latest 100 payouts' })
  list(@Req() req: AuthenticatedRequest) {
    return this.payouts.list(req.user.id);
  }
  @Get(':reference')
  @ApiOperation({ summary: 'Read your payout status' })
  get(@Req() req: AuthenticatedRequest, @Param('reference') reference: string) {
    return this.payouts.get(req.user.id, reference);
  }
  @Post(':reference/verify')
  @HttpCode(200)
  @ApiOperation({ summary: 'Check payout outcome with Paystack; never resubmit a transfer' })
  verify(@Req() req: AuthenticatedRequest, @Param('reference') reference: string) {
    return this.payouts.verify(reference, req.user.id);
  }
}
