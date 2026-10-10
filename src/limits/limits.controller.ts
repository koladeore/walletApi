import { CursorQueryDto, cursorBounds, cursorPage } from '../common/pagination/cursor';
import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Query,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiProperty, ApiTags } from '@nestjs/swagger';
import { IsIn } from 'class-validator';
import { PrismaService } from '../prisma/prisma.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AdminGuard } from '../auth/guards/admin.guard';
import { StaffReadAuditInterceptor } from '../auth/guards/staff-read-audit.interceptor';
import type { AuthenticatedRequest } from '../common/types/authenticated-request';
import { FinancialReasonDto } from '../common/dto/financial-reason.dto';
import { SensitiveAction } from '../security/step-up.guard';
import { LimitsService } from './limits.service';
class TierDto extends FinancialReasonDto {
  @ApiProperty({
    enum: ['BASIC', 'VERIFIED'],
    description:
      'VERIFIED requires manual review; this designation does not assert regulatory identity verification.',
  })
  @IsIn(['BASIC', 'VERIFIED'])
  tier!: string;
}
@ApiTags('account-limits')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('wallet/limits')
export class LimitsController {
  constructor(private readonly limits: LimitsService) {}
  @Get()
  @ApiOperation({
    summary: 'Read your tier, daily usage and outgoing limits',
    description:
      'Transfers and requested payouts share the daily limit, resetting at midnight Africa/Lagos. Failed/reversed payouts do not restore daily allowance. Unverified email permits no outgoing transactions.',
  })
  get(@Req() req: AuthenticatedRequest) {
    return this.limits.status(req.user.id);
  }
}
@ApiTags('admin-account-controls')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, AdminGuard)
@UseInterceptors(StaffReadAuditInterceptor)
@Controller('admin/account-controls')
export class AdminLimitsController {
  constructor(private readonly prisma: PrismaService) {}
  private async change(req: AuthenticatedRequest, userId: string, reason: string, tier?: string) {
    return this.prisma.$transaction(async (tx) => {
      for (const id of [...new Set([req.user.id, userId])].sort())
        await tx.$queryRaw`SELECT id FROM users WHERE id=${id} FOR UPDATE`;
      const actor = await tx.user.findUniqueOrThrow({ where: { id: req.user.id } });
      if (
        !actor.isActive ||
        actor.closedAt ||
        actor.role !== 'ADMIN' ||
        actor.authVersion !== req.stepUpAuthVersion
      )
        throw new ForbiddenException('Current administrator step-up required');
      const user = await tx.user.findUniqueOrThrow({ where: { id: userId } });
      if (tier) {
        if (!user.isActive || user.closedAt || (tier === 'VERIFIED' && !user.emailVerifiedAt))
          throw new ForbiddenException('Active verified-email account required for upgrade');
        await tx.user.update({ where: { id: userId }, data: { accountTier: tier } });
      } else {
        await tx.$queryRaw`SELECT id FROM wallets WHERE "userId"=${userId} FOR UPDATE`;
        await tx.wallet.update({ where: { userId }, data: { outgoingFrozen: true } });
      }
      await tx.auditLog.create({
        data: {
          userId: actor.id,
          action: tier ? 'ACCOUNT_TIER_CHANGED' : 'WALLET_OUTGOING_FROZEN',
          metadata: {
            targetUserId: userId,
            reason,
            ...(tier ? { previousTier: user.accountTier, tier } : {}),
          },
        },
      });
      return tier ? { userId, tier } : { userId, outgoingFrozen: true };
    });
  }
  @Post('users/:id/tier')
  @HttpCode(200)
  @SensitiveAction('ADMIN')
  @ApiOperation({ summary: 'Set account tier after manual review; requires exact ADMIN proof' })
  tier(
    @Req() req: AuthenticatedRequest,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: TierDto,
  ) {
    return this.change(req, id, dto.reason, dto.tier);
  }
  @Post('users/:id/freeze')
  @HttpCode(200)
  @SensitiveAction('ADMIN')
  @ApiOperation({
    summary: 'Freeze outgoing transfers and new payouts with an investigation reason',
    description:
      'Incoming credits and settlement of already submitted payouts remain possible. Unfreeze uses the existing financial-operations wallet endpoint.',
  })
  freeze(
    @Req() req: AuthenticatedRequest,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: FinancialReasonDto,
  ) {
    return this.change(req, id, dto.reason);
  }
  @Get('flags')
  @ApiOperation({
    summary: 'List open suspicious-activity flags with cursor pagination',
    description:
      'Flags require investigation; they do not automatically declare fraud or freeze money.',
  })
  async flags(@Query() query: CursorQueryDto) {
    const scope = 'activity-flags:open';
    const rows = await this.prisma.activityFlag.findMany({
      where: { AND: [{ status: 'OPEN' }, cursorBounds(query.cursor, scope)] },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: query.limit + 1,
    });
    return cursorPage(rows, query.limit, scope);
  }
  @Post('flags/:id/resolve')
  @HttpCode(200)
  @SensitiveAction('ADMIN')
  @ApiOperation({ summary: 'Record investigation outcome; does not unfreeze a wallet' })
  resolve(
    @Req() req: AuthenticatedRequest,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: FinancialReasonDto,
  ) {
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM users WHERE id=${req.user.id} FOR SHARE`;
      const actor = await tx.user.findUniqueOrThrow({ where: { id: req.user.id } });
      if (
        !actor.isActive ||
        actor.closedAt ||
        actor.role !== 'ADMIN' ||
        actor.authVersion !== req.stepUpAuthVersion
      )
        throw new ForbiddenException('Current administrator step-up required');
      const flag = await tx.activityFlag.update({
        where: { id },
        data: { status: 'RESOLVED', resolvedAt: new Date(), resolution: dto.reason },
      });
      await tx.auditLog.create({
        data: {
          userId: actor.id,
          action: 'ACTIVITY_FLAG_RESOLVED',
          metadata: { flagId: id, targetUserId: flag.userId, reason: dto.reason },
        },
      });
      return flag;
    });
  }
}
