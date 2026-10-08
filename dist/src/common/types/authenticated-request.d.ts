import type { Request } from 'express';
import type { Role } from '@prisma/client';
export interface AuthenticatedRequest extends Request {
    user: {
        id: string;
        role: Role;
    };
}
