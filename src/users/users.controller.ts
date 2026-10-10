import { CursorQueryDto } from '../common/pagination/cursor';
import { FinancialReasonDto } from '../common/dto/financial-reason.dto';
import {
  Controller,
  UseInterceptors,
  Get,
  Query,
  UseGuards,
  Req,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Post,
  Body,
  HttpCode,
  Patch,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { UsersService } from './users.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import type { AuthenticatedRequest } from '../common/types/authenticated-request';
import { AdminGuard } from '../auth/guards/admin.guard';
import { RecipientLookupDto } from './dto/recipient-lookup.dto';
import { UpdateUserStatusDto } from './dto/update-user-status.dto';
import { StaffReadAuditInterceptor } from '../auth/guards/staff-read-audit.interceptor';
import { SensitiveAction } from '../security/step-up.guard';

@ApiTags('users')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  @UseGuards(AdminGuard)
  @UseInterceptors(StaffReadAuditInterceptor)
  @ApiOperation({ summary: 'Get all users (admin only)' })
  @ApiResponse({ status: 403, description: 'Administrator access required.' })
  @ApiResponse({ status: 200, description: 'User profiles retrieved successfully.' })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  async getAllUsers(@Query() query: CursorQueryDto) {
    return this.usersService.getAllUsers(query);
  }

  @Get('profile')
  @ApiOperation({ summary: 'Get current user profile' })
  @ApiResponse({ status: 200, description: 'User profile retrieved successfully.' })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  async getProfile(@Req() req: AuthenticatedRequest) {
    const user = await this.usersService.getProfile(req.user.id);
    if (!user) {
      throw new NotFoundException('User profile not found');
    }
    return user;
  }

  @Get('wallet')
  @ApiOperation({ summary: 'Get current user wallet balance' })
  @ApiResponse({ status: 200, description: 'Wallet retrieved successfully.' })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  async getWallet(@Req() req: AuthenticatedRequest) {
    const wallet = await this.usersService.getWallet(req.user.id);
    if (!wallet) {
      throw new NotFoundException('Wallet not found');
    }
    return wallet;
  }

  @Post('recipient-lookup')
  @HttpCode(200)
  @ApiOperation({ summary: 'Look up an active wallet recipient by exact email' })
  @ApiResponse({ status: 200, description: 'Recipient ID, first name and last name only.' })
  @ApiResponse({ status: 400, description: 'Invalid email.' })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  @ApiResponse({ status: 404, description: 'Recipient not found.' })
  async lookupRecipient(@Body() dto: RecipientLookupDto) {
    const recipient = await this.usersService.lookupRecipient(dto.email);
    if (!recipient) throw new NotFoundException('Recipient not found');
    return recipient;
  }

  @Get(':id')
  @UseGuards(AdminGuard)
  @UseInterceptors(StaffReadAuditInterceptor)
  @ApiOperation({ summary: 'Get user by ID (admin only)' })
  @ApiResponse({ status: 403, description: 'Administrator access required.' })
  @ApiResponse({ status: 200, description: 'User profile retrieved successfully.' })
  @ApiResponse({ status: 400, description: 'Invalid user ID.' })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  @ApiResponse({ status: 404, description: 'User not found.' })
  async getUserById(@Param('id', new ParseUUIDPipe()) id: string) {
    const user = await this.usersService.getProfile(id);
    if (!user) {
      throw new NotFoundException('User not found');
    }
    return user;
  }

  @Post(':id/close')
  @SensitiveAction('ADMIN')
  @UseGuards(AdminGuard)
  @HttpCode(200)
  @ApiOperation({
    summary: 'Permanently close a settled account while retaining history (admin only)',
  })
  closeAccount(
    @Req() req: AuthenticatedRequest,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: FinancialReasonDto,
  ) {
    return this.usersService.closeAccount(req.user.id, id, dto.reason, req.stepUpAuthVersion);
  }

  @Patch(':id/status')
  @SensitiveAction('ADMIN')
  @UseGuards(AdminGuard)
  @UseInterceptors(StaffReadAuditInterceptor)
  @ApiOperation({ summary: 'Activate or deactivate a user (admin only)' })
  @ApiResponse({ status: 200, description: 'Updated public user profile.' })
  @ApiResponse({ status: 400, description: 'Invalid request or self-deactivation.' })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  @ApiResponse({ status: 403, description: 'Administrator access required.' })
  @ApiResponse({ status: 404, description: 'User not found.' })
  updateStatus(
    @Req() req: AuthenticatedRequest,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateUserStatusDto,
  ) {
    return this.usersService.updateStatus(req.user.id, id, dto, req.stepUpAuthVersion);
  }
}
