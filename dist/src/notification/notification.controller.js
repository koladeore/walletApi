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
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.NotificationController = void 0;
const cursor_1 = require("../common/pagination/cursor");
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const class_validator_1 = require("class-validator");
const class_transformer_1 = require("class-transformer");
const jwt_auth_guard_1 = require("../auth/guards/jwt-auth.guard");
const notification_service_1 = require("./notification.service");
class NotificationQuery extends cursor_1.CursorQueryDto {
    mode;
    page = 1;
    unreadOnly;
}
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ enum: ['page', 'cursor'], default: 'page' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsIn)(['page', 'cursor']),
    __metadata("design:type", String)
], NotificationQuery.prototype, "mode", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ default: 1, minimum: 1, maximum: 1000 }),
    (0, class_transformer_1.Type)(() => Number),
    (0, class_validator_1.IsInt)(),
    (0, class_validator_1.Min)(1),
    (0, class_validator_1.Max)(1000),
    __metadata("design:type", Object)
], NotificationQuery.prototype, "page", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ enum: ['true', 'false'], default: 'false' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsIn)(['true', 'false']),
    __metadata("design:type", String)
], NotificationQuery.prototype, "unreadOnly", void 0);
let NotificationController = class NotificationController {
    notifications;
    constructor(notifications) {
        this.notifications = notifications;
    }
    list(req, query) {
        return this.notifications.list(req.user.id, query.page, query.unreadOnly === 'true', query);
    }
    count(req) {
        return this.notifications.unreadCount(req.user.id);
    }
    all(req) {
        return this.notifications.readAll(req.user.id);
    }
    read(req, id) {
        return this.notifications.read(req.user.id, id);
    }
};
exports.NotificationController = NotificationController;
__decorate([
    (0, common_1.Get)(),
    (0, swagger_1.ApiOperation)({
        summary: 'List your persisted notifications, newest first',
        description: 'Legacy mode uses 20 per page; mode=cursor supports limit (max 100) and nextCursor. data contains navigation IDs and money in minor-unit strings. Render title/body as plain text. These are informational; read wallet/payment endpoints for authoritative state.',
    }),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Query)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, NotificationQuery]),
    __metadata("design:returntype", void 0)
], NotificationController.prototype, "list", null);
__decorate([
    (0, common_1.Get)('unread-count'),
    (0, swagger_1.ApiOperation)({ summary: 'Read your unread notification count' }),
    __param(0, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], NotificationController.prototype, "count", null);
__decorate([
    (0, common_1.Post)('read-all'),
    (0, common_1.HttpCode)(200),
    (0, swagger_1.ApiOperation)({ summary: 'Mark your currently unread notifications as read' }),
    __param(0, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], NotificationController.prototype, "all", null);
__decorate([
    (0, common_1.Post)(':id/read'),
    (0, common_1.HttpCode)(200),
    (0, swagger_1.ApiOperation)({
        summary: 'Mark one of your notifications read; repeated calls preserve its first read timestamp',
    }),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Param)('id', new common_1.ParseUUIDPipe())),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", void 0)
], NotificationController.prototype, "read", null);
exports.NotificationController = NotificationController = __decorate([
    (0, swagger_1.ApiTags)('notifications'),
    (0, swagger_1.ApiBearerAuth)(),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard),
    (0, common_1.Controller)('notifications'),
    __metadata("design:paramtypes", [notification_service_1.NotificationService])
], NotificationController);
//# sourceMappingURL=notification.controller.js.map