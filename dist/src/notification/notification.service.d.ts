import { PrismaService } from '../prisma/prisma.service';
export declare class NotificationService {
    private readonly prisma;
    constructor(prisma: PrismaService);
    private readonly select;
    list(userId: string, page: number, unreadOnly: boolean): Promise<{
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
    unreadCount(userId: string): Promise<{
        unreadCount: number;
    }>;
    read(userId: string, id: string): Promise<{
        title: string;
        id: string;
        createdAt: Date;
        data: import("@prisma/client/runtime/client").JsonValue;
        kind: string;
        body: string;
        readAt: Date | null;
    }>;
    readAll(userId: string): Promise<{
        updated: number;
    }>;
}
