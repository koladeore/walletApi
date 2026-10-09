import { CallHandler, ExecutionContext, NestInterceptor } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
export declare class StaffReadAuditInterceptor implements NestInterceptor {
    private readonly prisma;
    constructor(prisma: PrismaService);
    intercept(context: ExecutionContext, next: CallHandler): import("rxjs").Observable<any>;
}
