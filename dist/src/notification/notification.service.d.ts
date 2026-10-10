import { CursorQueryDto } from '../common/pagination/cursor';
import { PrismaService } from '../prisma/prisma.service';
export declare class NotificationService {
    private readonly prisma;
    constructor(prisma: PrismaService);
    private readonly select;
    list(userId: string, page: number, unreadOnly: boolean, query?: CursorQueryDto & {
        mode?: string;
    }): Promise<{
        unreadCount: number;
        data: {
            title: string;
            createdAt: Date;
            id: string;
            data: import("@prisma/client/runtime/client").JsonValue;
            kind: string;
            body: string;
            readAt: Date | null;
        }[];
        meta: {
            limit: number;
            hasMore: boolean;
            nextCursor: string | null;
        };
    } | {
        data: {
            title: string;
            createdAt: Date;
            id: string;
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
    unreadCount(userId: string): Promise<{
        unreadCount: number;
    }>;
    read(userId: string, id: string): Promise<{
        title: string;
        createdAt: Date;
        id: string;
        data: import("@prisma/client/runtime/client").JsonValue;
        kind: string;
        body: string;
        readAt: Date | null;
    }>;
    readAll(userId: string): Promise<{
        updated: number;
    }>;
}
