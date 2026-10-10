import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
@Injectable()
export class NotificationService {
  constructor(private readonly prisma: PrismaService) {}
  private readonly select = {
    id: true,
    kind: true,
    title: true,
    body: true,
    data: true,
    readAt: true,
    createdAt: true,
  } as const;
  async list(userId: string, page: number, unreadOnly: boolean) {
    const where = { userId, ...(unreadOnly ? { readAt: null } : {}) };
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
  async unreadCount(userId: string) {
    return {
      unreadCount: await this.prisma.notification.count({ where: { userId, readAt: null } }),
    };
  }
  async read(userId: string, id: string) {
    await this.prisma.notification.updateMany({
      where: { id, userId, readAt: null },
      data: { readAt: new Date() },
    });
    const row = await this.prisma.notification.findFirst({
      where: { id, userId },
      select: this.select,
    });
    if (!row) throw new NotFoundException('Notification not found');
    return row;
  }
  async readAll(userId: string) {
    const result = await this.prisma.notification.updateMany({
      where: { userId, readAt: null },
      data: { readAt: new Date() },
    });
    return { updated: result.count };
  }
}
