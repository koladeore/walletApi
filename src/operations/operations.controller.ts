import { CursorQueryDto, cursorBounds, cursorPage } from '../common/pagination/cursor';
import {
  Body,
  ConflictException,
  ForbiddenException,
  Controller,
  Get,
  Query,
  Param,
  Post,
  Req,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { IsString, MaxLength, MinLength } from 'class-validator';
import { Transform } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AdminGuard } from '../auth/guards/admin.guard';
import type { AuthenticatedRequest } from '../common/types/authenticated-request';
import { PrismaService } from '../prisma/prisma.service';
import { ReconciliationService } from './reconciliation.service';
import { StaffReadAuditInterceptor } from '../auth/guards/staff-read-audit.interceptor';
import { SensitiveAction } from '../security/step-up.guard';

class InvestigationDto {
  @ApiProperty({ description: 'Investigation result and external evidence reference' })
  @Transform(({ obj }: { obj: Record<string, unknown> }) =>
    typeof obj.reason === 'string' ? obj.reason.trim() : obj.reason,
  )
  @IsString()
  @MinLength(10)
  @MaxLength(1000)
  reason!: string;
}
@ApiTags('financial-operations')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, AdminGuard)
@UseInterceptors(StaffReadAuditInterceptor)
@Controller('admin/financial-operations')
export class OperationsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly reconciliation: ReconciliationService,
  ) {}
  @Post('wallets/:id/unfreeze')
  @SensitiveAction('ADMIN')
  @ApiOperation({ summary: 'Unfreeze outgoing money after recorded investigation (admin)' })
  unfreeze(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() dto: InvestigationDto,
  ) {
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM users WHERE id=${req.user.id} FOR SHARE`;
      const actor = await tx.user.findUnique({ where: { id: req.user.id } });
      if (!actor?.isActive || actor.closedAt || actor.role !== 'ADMIN')
        throw new ForbiddenException('Active administrator required');
      if (req.stepUpAuthVersion !== undefined && actor.authVersion !== req.stepUpAuthVersion)
        throw new ForbiddenException('Authentication changed; repeat step-up');
      await tx.$queryRaw`SELECT id FROM wallets WHERE id=${id} FOR UPDATE`;
      const wallet = await tx.wallet.findUniqueOrThrow({ where: { id } });
      const cases = await tx.financialCase.findMany({ where: { walletId: id } });
      const references = cases.map((item) => item.reference);
      if (
        cases.some(
          (item) =>
            item.kind === 'DISPUTE' &&
            !item.applied &&
            !['resolved', 'archived'].includes(item.providerStatus),
        ) ||
        (await tx.reconciliationIssue.count({
          where: {
            status: 'OPEN',
            OR: [
              { reference: { in: references } },
              { details: { path: ['walletId'], equals: id } },
            ],
          },
        }))
      )
        throw new ConflictException(
          'Resolve active disputes and investigation issues before unfreezing',
        );
      if (await tx.activityFlag.count({ where: { userId: wallet.userId, status: 'OPEN' } }))
        throw new ConflictException('Resolve suspicious activity flags before unfreezing');
      if (wallet.closedAt) throw new ConflictException('Closed wallets cannot be unfrozen');
      const updated = await tx.wallet.update({ where: { id }, data: { outgoingFrozen: false } });
      await tx.auditLog.create({
        data: {
          userId: req.user.id,
          action: 'WALLET_OUTGOING_UNFROZEN',
          metadata: { walletId: id, reason: dto.reason },
        },
      });
      return { walletId: updated.id, outgoingFrozen: updated.outgoingFrozen };
    });
  }
  @Post('reconcile')
  @SensitiveAction('ADMIN')
  @ApiOperation({ summary: 'Run provider and ledger reconciliation (admin)' })
  async run(@Req() req: AuthenticatedRequest, @Body() dto: InvestigationDto) {
    await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM users WHERE id=${req.user.id} FOR SHARE`;
      const actor = await tx.user.findUnique({ where: { id: req.user.id } });
      if (
        !actor?.isActive ||
        actor.closedAt ||
        actor.role !== 'ADMIN' ||
        actor.authVersion !== req.stepUpAuthVersion
      )
        throw new ForbiddenException('Active administrator and current step-up required');
      await tx.auditLog.create({
        data: {
          userId: actor.id,
          action: 'ADMIN_RECONCILIATION_REQUESTED',
          metadata: { reason: dto.reason },
        },
      });
    });
    const run = await this.reconciliation.run();
    await this.prisma.auditLog.create({
      data: {
        userId: req.user.id,
        action: 'ADMIN_RECONCILIATION_COMPLETED',
        metadata: { runId: run.id, status: run.status, reason: dto.reason },
      },
    });
    return run;
  }

  @Get('runs')
  @ApiOperation({ summary: 'List reconciliation runs with cursor pagination' })
  async runs(@Query() query: CursorQueryDto) {
    const scope = 'reconciliation-runs';
    const rows = await this.prisma.reconciliationRun.findMany({
      where: cursorBounds(query.cursor, scope, 'startedAt'),
      orderBy: [{ startedAt: 'desc' }, { id: 'desc' }],
      take: query.limit + 1,
    });
    return cursorPage(rows, query.limit, scope, 'startedAt');
  }
  @Get('issues')
  @ApiOperation({ summary: 'List unresolved reconciliation issues with cursor pagination' })
  async issues(@Query() query: CursorQueryDto) {
    const scope = 'reconciliation-issues:open';
    const rows = await this.prisma.reconciliationIssue.findMany({
      where: { AND: [{ status: 'OPEN' }, cursorBounds(query.cursor, scope, 'firstSeenAt')] },
      orderBy: [{ firstSeenAt: 'desc' }, { id: 'desc' }],
      take: query.limit + 1,
    });
    return cursorPage(rows, query.limit, scope, 'firstSeenAt');
  }
  @Get('cases')
  @ApiOperation({ summary: 'List financial cases by creation date with cursor pagination' })
  async cases(@Query() query: CursorQueryDto) {
    const scope = 'financial-cases';
    const rows = await this.prisma.financialCase.findMany({
      where: cursorBounds(query.cursor, scope),
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: query.limit + 1,
    });
    return cursorPage(rows, query.limit, scope, 'createdAt', (row) => ({
      ...row,
      amountMinor: row.amountMinor.toString(),
      recoveredMinor: row.recoveredMinor.toString(),
      shortfallMinor: row.shortfallMinor.toString(),
    }));
  }
  @Get('fees')
  @ApiOperation({ summary: 'List provider fees with cursor pagination' })
  async fees(@Query() query: CursorQueryDto) {
    const scope = 'provider-fees';
    const rows = await this.prisma.providerFee.findMany({
      where: cursorBounds(query.cursor, scope),
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: query.limit + 1,
    });
    return cursorPage(rows, query.limit, scope, 'createdAt', (row) => ({
      ...row,
      amountMinor: row.amountMinor.toString(),
    }));
  }
  @Post('issues/:id/resolve')
  @SensitiveAction('ADMIN')
  @ApiOperation({ summary: 'Record investigation resolution without changing balances' })
  resolve(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() dto: InvestigationDto,
  ) {
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM users WHERE id=${req.user.id} FOR SHARE`;
      const actor = await tx.user.findUnique({ where: { id: req.user.id } });
      if (!actor?.isActive || actor.closedAt || actor.role !== 'ADMIN')
        throw new ForbiddenException('Active administrator required');
      if (req.stepUpAuthVersion !== undefined && actor.authVersion !== req.stepUpAuthVersion)
        throw new ForbiddenException('Authentication changed; repeat step-up');
      const issue = await tx.reconciliationIssue.update({
        where: { id },
        data: { status: 'RESOLVED', resolvedAt: new Date(), resolution: dto.reason },
      });
      await tx.auditLog.create({
        data: {
          userId: req.user.id,
          action: 'RECONCILIATION_ISSUE_RESOLVED',
          metadata: { issueId: id, reason: dto.reason },
        },
      });
      return issue;
    });
  }
}
