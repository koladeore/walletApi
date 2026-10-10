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
exports.CursorQueryDto = void 0;
exports.cursorBounds = cursorBounds;
exports.cursorPage = cursorPage;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const class_validator_1 = require("class-validator");
const class_transformer_1 = require("class-transformer");
class CursorQueryDto {
    limit = 20;
    cursor;
}
exports.CursorQueryDto = CursorQueryDto;
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        default: 20,
        minimum: 1,
        maximum: 100,
        description: 'Records per page. Maximum 100.',
    }),
    (0, class_validator_1.IsOptional)(),
    (0, class_transformer_1.Type)(() => Number),
    (0, class_validator_1.IsInt)(),
    (0, class_validator_1.Min)(1),
    (0, class_validator_1.Max)(100),
    __metadata("design:type", Object)
], CursorQueryDto.prototype, "limit", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        description: 'Opaque nextCursor from the previous response. Keep the same filters. Omit for first page.',
    }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(2048),
    __metadata("design:type", String)
], CursorQueryDto.prototype, "cursor", void 0);
function cursorBounds(cursor, scope, field = 'createdAt') {
    if (!cursor)
        return {};
    try {
        if (cursor.length > 2048 || !/^[A-Za-z0-9_-]+$/.test(cursor))
            throw Error();
        const parsed = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
        if (!parsed || typeof parsed !== 'object')
            throw Error();
        const value = parsed;
        if (value.scope !== scope ||
            value.field !== field ||
            typeof value.id !== 'string' ||
            value.id.length < 1 ||
            value.id.length > 200 ||
            typeof value.date !== 'string')
            throw Error();
        const date = new Date(value.date);
        if (!Number.isFinite(date.getTime()) || date.toISOString() !== value.date)
            throw Error();
        return { OR: [{ [field]: { lt: date } }, { [field]: date, id: { lt: value.id } }] };
    }
    catch {
        throw new common_1.BadRequestException('Invalid cursor for this list and filters');
    }
}
function cursorPage(rows, limit, scope, field = 'createdAt', map = (row) => row) {
    const hasMore = rows.length > limit;
    const visible = rows.slice(0, limit);
    const last = visible.at(-1);
    const date = last ? last[field] : null;
    const nextCursor = hasMore && last && date instanceof Date
        ? Buffer.from(JSON.stringify({ scope, field, date: date.toISOString(), id: last.id })).toString('base64url')
        : null;
    return { data: visible.map(map), meta: { limit, hasMore, nextCursor } };
}
//# sourceMappingURL=cursor.js.map