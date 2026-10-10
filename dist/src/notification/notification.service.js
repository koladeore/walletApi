"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.NotificationService = void 0;
const common_1 = require("@nestjs/common");
const cursor_1 = require("../common/pagination/cursor");
const common_2 = require("@nestjs/common");
const prisma_service_1 = require("../prisma/prisma.service");
let NotificationService = class NotificationService {
    prisma;
    constructor(prisma) {
        this.prisma = prisma;
    }
    select = {
        id: true,
        kind: true,
        title: true,
        body: true,
        data: true,
        readAt: true,
        createdAt: true,
    };
    async list(userId, page, unreadOnly, query) {
        const where = { userId, ...(unreadOnly ? { readAt: null } : {}) };
        if (query?.cursor && query.mode !== 'cursor')
            throw new common_1.BadRequestException('cursor requires mode=cursor');
        if (query?.mode === 'cursor') {
            if (page !== 1)
                throw new common_1.BadRequestException('Cursor mode cannot be combined with page');
            const scope = `notifications:${userId}:${unreadOnly}`;
            const rows = await this.prisma.notification.findMany({
                where: { AND: [where, (0, cursor_1.cursorBounds)(query.cursor, scope)] },
                select: this.select,
                orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
                take: query.limit + 1,
            });
            const count = await this.unreadCount(userId);
            return { ...(0, cursor_1.cursorPage)(rows, query.limit, scope), ...count };
        }
        if (query?.limit && query.limit !== 20)
            throw new common_1.BadRequestException('limit requires mode=cursor');
        const [data, total, unreadCount] = await this.prisma.$transaction([
            this.prisma.notification.findMany({
                where,
                select: this.select,
                orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
                skip: (page - 1) * 20,
                take: 20,
            }),
            this.prisma.notification.count({ where }),
            this.prisma.notification.count({ where: { userId, readAt: null } }),
        ]);
        return {
            data,
            meta: { page, pageSize: 20, total, totalPages: Math.ceil(total / 20) },
            unreadCount,
        };
    }
    async unreadCount(userId) {
        return {
            unreadCount: await this.prisma.notification.count({ where: { userId, readAt: null } }),
        };
    }
    async read(userId, id) {
        await this.prisma.notification.updateMany({
            where: { id, userId, readAt: null },
            data: { readAt: new Date() },
        });
        const row = await this.prisma.notification.findFirst({
            where: { id, userId },
            select: this.select,
        });
        if (!row)
            throw new common_2.NotFoundException('Notification not found');
        return row;
    }
    async readAll(userId) {
        const result = await this.prisma.notification.updateMany({
            where: { userId, readAt: null },
            data: { readAt: new Date() },
        });
        return { updated: result.count };
    }
};
exports.NotificationService = NotificationService;
exports.NotificationService = NotificationService = __decorate([
    (0, common_2.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], NotificationService);
//# sourceMappingURL=notification.service.js.map