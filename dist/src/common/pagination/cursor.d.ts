export declare class CursorQueryDto {
    limit: number;
    cursor?: string;
}
type Field = 'createdAt' | 'startedAt' | 'firstSeenAt';
type Bounds = {
    OR: Array<{
        id?: {
            lt: string;
        };
        createdAt?: Date | {
            lt: Date;
        };
        startedAt?: Date | {
            lt: Date;
        };
        firstSeenAt?: Date | {
            lt: Date;
        };
    }>;
};
export declare function cursorBounds(cursor: string | undefined, scope: string, field?: Field): Bounds | Record<string, never>;
export declare function cursorPage<T extends {
    id: string;
}, R = T>(rows: T[], limit: number, scope: string, field?: Field, map?: (row: T) => R): {
    data: R[];
    meta: {
        limit: number;
        hasMore: boolean;
        nextCursor: string | null;
    };
};
export {};
