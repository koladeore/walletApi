import {
  applyDecorators,
  CanActivate,
  ExecutionContext,
  Injectable,
  SetMetadata,
  UseGuards,
} from '@nestjs/common';
import { ApiHeader } from '@nestjs/swagger';
import { Reflector } from '@nestjs/core';
import type { AuthenticatedRequest } from '../common/types/authenticated-request';
import type { SecurityAction } from './actions';
import { SecurityService } from './security.service';

export const RequiresStepUp = (action: SecurityAction) => SetMetadata('securityAction', action);
export const SensitiveAction = (action: SecurityAction) =>
  applyDecorators(
    RequiresStepUp(action),
    UseGuards(StepUpGuard),
    ApiHeader({
      name: 'x-step-up-token',
      required: true,
      description:
        'Single-use proof from the account-security step-up flow, bound to this exact action',
    }),
  );
@Injectable()
export class StepUpGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly security: SecurityService,
  ) {}
  async canActivate(context: ExecutionContext) {
    const action = this.reflector.getAllAndOverride<SecurityAction>('securityAction', [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!action) return true;
    const req = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const body = (req.body ?? {}) as Record<string, unknown>;
    const details =
      action === 'ADMIN'
        ? { method: req.method, path: req.originalUrl.split('?')[0], body }
        : action === 'TRANSFER'
          ? { receiverEmail: body.receiverEmail, amount: body.amount }
          : action === 'PAYOUT'
            ? { beneficiaryId: body.beneficiaryId, amount: body.amount }
            : { bankCode: body.bankCode, accountNumber: body.accountNumber };
    const header = req.headers['x-step-up-token'];
    req.stepUpAuthVersion = await this.security.authorize(
      req.user.id,
      typeof header === 'string' ? header : undefined,
      action,
      details,
    );
    return true;
  }
}
