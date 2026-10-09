import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import type { AuthenticatedRequest } from '../common/types/authenticated-request';
import { BeneficiariesService } from './beneficiaries.service';
import { BankAccountDto } from './dto/bank-account.dto';
import { BankListQueryDto } from './dto/bank-list-query.dto';

@ApiTags('beneficiaries')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('beneficiaries')
export class BeneficiariesController {
  constructor(private readonly beneficiaries: BeneficiariesService) {}
  @Get('banks')
  @ApiOperation({ summary: 'List Nigerian banks and codes for NGN beneficiaries' })
  banks(@Req() req: AuthenticatedRequest, @Query() query: BankListQueryDto) {
    return this.beneficiaries.banks(req.user.id, query.page);
  }
  @Post('resolve')
  @HttpCode(200)
  @ApiOperation({ summary: 'Preview the account name verified by Paystack (does not save)' })
  resolve(@Req() req: AuthenticatedRequest, @Body() dto: BankAccountDto) {
    return this.beneficiaries.resolve(req.user.id, dto);
  }
  @Post()
  @ApiOperation({ summary: 'Verify and save a beneficiary; duplicate bank details reuse its ID' })
  create(@Req() req: AuthenticatedRequest, @Body() dto: BankAccountDto) {
    return this.beneficiaries.create(req.user.id, dto);
  }
  @Get()
  @ApiOperation({ summary: 'List your beneficiaries with masked account numbers' })
  list(@Req() req: AuthenticatedRequest) {
    return this.beneficiaries.list(req.user.id);
  }
  @Get(':id')
  @ApiOperation({ summary: 'Read one of your beneficiaries' })
  get(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    return this.beneficiaries.get(req.user.id, id);
  }
}
