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
exports.StaffReadAuditInterceptor = void 0;
const common_1 = require("@nestjs/common");
const rxjs_1 = require("rxjs");
const prisma_service_1 = require("../../prisma/prisma.service");
let StaffReadAuditInterceptor = class StaffReadAuditInterceptor {
    prisma;
    constructor(prisma) {
        this.prisma = prisma;
    }
    intercept(context, next) {
        const req = context.switchToHttp().getRequest();
        if (req.method !== 'GET')
            return next.handle();
        return next.handle().pipe((0, rxjs_1.mergeMap)(async (value) => {
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
        }));
    }
};
exports.StaffReadAuditInterceptor = StaffReadAuditInterceptor;
exports.StaffReadAuditInterceptor = StaffReadAuditInterceptor = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], StaffReadAuditInterceptor);
//# sourceMappingURL=staff-read-audit.interceptor.js.map