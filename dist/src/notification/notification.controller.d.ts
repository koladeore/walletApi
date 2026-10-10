import type { AuthenticatedRequest } from '../common/types/authenticated-request';
import { NotificationService } from './notification.service';
declare class NotificationQuery {
    page: number;
    unreadOnly?: string;
}
export declare class NotificationController {
    private readonly notifications;
    constructor(notifications: NotificationService);
    list(req: AuthenticatedRequest, query: NotificationQuery): Promise<{
        data: {
            title: string;
            id: string;
            createdAt: Date;
            data: import("@prisma/client/runtime/client").JsonValue;
            kind: string;
            body: string;
            readAt: Date | null;
        }[];
        meta: {
            page: number;
            pageSize: number;
            total: number;
            totalPages: number;
        };
        unreadCount: number;
    }>;
    count(req: AuthenticatedRequest): Promise<{
        unreadCount: number;
    }>;
    all(req: AuthenticatedRequest): Promise<{
        updated: number;
    }>;
    read(req: AuthenticatedRequest, id: string): Promise<{
        title: string;
        id: string;
        createdAt: Date;
        data: import("@prisma/client/runtime/client").JsonValue;
        kind: string;
        body: string;
        readAt: Date | null;
    }>;
}
export {};
