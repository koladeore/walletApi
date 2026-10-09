import {
  Body,
  ConflictException,
  ForbiddenException,
  Controller,
  Get,
  Param,
  Post,
  Req,
  UseGuards,
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
  @ApiOperation({ summary: 'Run provider and ledger reconciliation (admin)' })
  run() {
    return this.reconciliation.run();
  }
  @Get('runs')
  @ApiOperation({ summary: 'Read latest 100 reconciliation runs' })
  runs() {
    return this.prisma.reconciliationRun.findMany({ orderBy: { startedAt: 'desc' }, take: 100 });
  }
  @Get('issues')
  @ApiOperation({ summary: 'Read latest 100 unresolved reconciliation issues' })
  issues() {
    return this.prisma.reconciliationIssue.findMany({
      where: { status: 'OPEN' },
      orderBy: { lastSeenAt: 'desc' },
      take: 100,
    });
  }
  @Get('cases')
  @ApiOperation({ summary: 'Read latest financial cases and recovery shortfalls' })
  async cases() {
    return (
      await this.prisma.financialCase.findMany({ orderBy: { updatedAt: 'desc' }, take: 100 })
    ).map((row) => ({
      ...row,
      amountMinor: row.amountMinor.toString(),
      recoveredMinor: row.recoveredMinor.toString(),
      shortfallMinor: row.shortfallMinor.toString(),
    }));
  }
  @Get('fees')
  @ApiOperation({ summary: 'Read latest 100 verified business-borne provider fees' })
  async fees() {
    return (
      await this.prisma.providerFee.findMany({ orderBy: { createdAt: 'desc' }, take: 100 })
    ).map((row) => ({ ...row, amountMinor: row.amountMinor.toString() }));
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
