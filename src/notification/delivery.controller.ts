import {
  Body,
  ConflictException,
  Controller,
  ForbiddenException,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
  UseGuards,
  UseInterceptors,
  NotFoundException,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiPropertyOptional, ApiTags } from '@nestjs/swagger';
import { IsIn, IsOptional } from 'class-validator';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AdminGuard } from '../auth/guards/admin.guard';
import { StaffReadAuditInterceptor } from '../auth/guards/staff-read-audit.interceptor';
import { SensitiveAction } from '../security/step-up.guard';
import { CursorQueryDto, cursorBounds, cursorPage } from '../common/pagination/cursor';
import { FinancialReasonDto } from '../common/dto/financial-reason.dto';
import type { AuthenticatedRequest } from '../common/types/authenticated-request';
class DeliveryQuery extends CursorQueryDto {
  @ApiPropertyOptional({ enum: ['FAILED', 'SKIPPED', 'PENDING'], default: 'FAILED' })
  @IsOptional()
  @IsIn(['FAILED', 'SKIPPED', 'PENDING'])
  status = 'FAILED';
}
const select = {
  id: true,
  userId: true,
  kind: true,
  title: true,
  createdAt: true,
  emailFirstAttemptAt: true,
  emailStatus: true,
  emailAttempts: true,
  emailBatchAttempts: true,
  emailRecoveryCount: true,
  emailLastError: true,
  emailNextAttemptAt: true,
  emailLockedUntil: true,
} as const;
@ApiTags('admin-notification-deliveries')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, AdminGuard)
@UseInterceptors(StaffReadAuditInterceptor)
@Controller('admin/notification-deliveries')
export class DeliveryController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}
  @Get()
  @ApiOperation({
    summary: 'Inspect failed, skipped or pending notification email deliveries',
    description:
      'Safe failure codes only; security verification codes use a separate store and are never returned here.',
  })
  async list(@Query() query: DeliveryQuery) {
    const scope = `notification-deliveries:${query.status}`;
    const rows = await this.prisma.notification.findMany({
      where: { AND: [{ emailStatus: query.status }, cursorBounds(query.cursor, scope)] },
      select,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: query.limit + 1,
    });
    return cursorPage(rows, query.limit, scope);
  }
  @Get(':id')
  @ApiOperation({ summary: 'Inspect one notification email delivery' })
  async get(@Param('id', new ParseUUIDPipe()) id: string) {
    const row = await this.prisma.notification.findUnique({ where: { id }, select });
    if (!row) throw new NotFoundException('Delivery not found');
    return row;
  }
  @Post(':id/retry')
  @HttpCode(200)
  @SensitiveAction('ADMIN')
  @ApiOperation({
    summary: 'Requeue an eligible failed notification delivery with an audited reason',
    description:
      'Requires exact ADMIN step-up proof. Only FAILED/SKIPPED events within one hour of their first send attempt (or never sent), eligible unchanged recipients, and at most three recoveries. Preserves event and email idempotency key. Never retries sent or uncertain legacy deliveries.',
  })
  retry(
    @Req() req: AuthenticatedRequest,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: FinancialReasonDto,
  ) {
    if (
      this.config.get('AUTH_DELIVERY_MODE') !== 'provider' ||
      this.config.get('NOTIFICATION_EMAIL_ENABLED') === 'false'
    )
      throw new ConflictException('Notification email delivery is disabled');
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
      await tx.$queryRaw`SELECT id FROM notifications WHERE id=${id} FOR UPDATE`;
      const row = await tx.notification.findUnique({ where: { id }, include: { user: true } });
      if (!row) throw new NotFoundException('Delivery not found');
      if (
        !['FAILED', 'SKIPPED'].includes(row.emailStatus) ||
        (row.emailLockedUntil && row.emailLockedUntil > new Date()) ||
        (row.emailFirstAttemptAt && row.emailFirstAttemptAt.getTime() < Date.now() - 3600000) ||
        row.emailRecoveryCount >= 3 ||
        row.emailLastError === 'LEGACY_DELIVERY_REVIEW_REQUIRED'
      )
        throw new ConflictException('Delivery is not eligible for safe retry');
      if (
        !row.user.isActive ||
        row.user.closedAt ||
        (row.kind !== 'WELCOME' && !row.user.emailVerifiedAt) ||
        (row.emailRecipient && row.emailRecipient !== row.user.email)
      )
        throw new ConflictException('Delivery recipient is not eligible');
      const updated = await tx.notification.update({
        where: { id },
        data: {
          emailStatus: 'PENDING',
          emailBatchAttempts: 0,
          emailRecoveryCount: { increment: 1 },
          emailLockedUntil: null,
          emailNextAttemptAt: new Date(),
        },
        select,
      });
      await tx.auditLog.create({
        data: {
          userId: actor.id,
          action: 'NOTIFICATION_DELIVERY_REQUEUED',
          metadata: {
            notificationId: id,
            targetUserId: row.userId,
            previousStatus: row.emailStatus,
            previousFailure: row.emailLastError,
            reason: dto.reason,
          },
        },
      });
      return updated;
    });
  }
}
