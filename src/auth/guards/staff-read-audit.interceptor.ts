import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { mergeMap } from 'rxjs';
import { PrismaService } from '../../prisma/prisma.service';
import type { AuthenticatedRequest } from '../../common/types/authenticated-request';

/** Record staff reads without copying response data, query strings, or credentials. */
@Injectable()
export class StaffReadAuditInterceptor implements NestInterceptor {
  constructor(private readonly prisma: PrismaService) {}
  intercept(context: ExecutionContext, next: CallHandler) {
    const req = context.switchToHttp().getRequest<AuthenticatedRequest>();
    if (req.method !== 'GET') return next.handle();
    return next.handle().pipe(
      mergeMap(async (value: unknown) => {
        await this.prisma.auditLog.create({
          data: {
            userId: req.user.id,
            action: 'ADMIN_RECORDS_READ',
            metadata: {
              method: req.method,
              path: req.originalUrl.split('?')[0],
              ...(req.params.id ? { targetId: req.params.id } : {}),
            },
          },
        });
        return value;
      }),
    );
  }
}
