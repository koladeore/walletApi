import type { Request } from 'express';
import type { Role } from '@prisma/client';
export interface AuthenticatedRequest extends Request {
    stepUpAuthVersion?: number;
    user: {
        id: string;
        role: Role;
        sessionId: string;
    };
}
