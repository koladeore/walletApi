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
exports.StepUpRequestDto = exports.ResetConfirmDto = exports.ResetRequestDto = exports.CodeDto = void 0;
const swagger_1 = require("@nestjs/swagger");
const class_transformer_1 = require("class-transformer");
const class_validator_1 = require("class-validator");
class CodeDto {
    challengeId;
    code;
}
exports.CodeDto = CodeDto;
__decorate([
    (0, swagger_1.ApiProperty)(),
    (0, class_validator_1.IsUUID)(),
    __metadata("design:type", String)
], CodeDto.prototype, "challengeId", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: '123456' }),
    (0, class_transformer_1.Transform)(({ obj }) => obj.code),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.Matches)(/^\d{6}$/),
    __metadata("design:type", String)
], CodeDto.prototype, "code", void 0);
class ResetRequestDto {
    email;
}
exports.ResetRequestDto = ResetRequestDto;
__decorate([
    (0, swagger_1.ApiProperty)(),
    (0, class_validator_1.IsEmail)(),
    (0, class_validator_1.MaxLength)(320),
    __metadata("design:type", String)
], ResetRequestDto.prototype, "email", void 0);
class ResetConfirmDto extends CodeDto {
    newPassword;
}
exports.ResetConfirmDto = ResetConfirmDto;
__decorate([
    (0, swagger_1.ApiProperty)({ minLength: 12, maxLength: 72 }),
    (0, class_transformer_1.Transform)(({ obj }) => obj.newPassword),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MinLength)(12),
    (0, class_validator_1.MaxLength)(72),
    __metadata("design:type", String)
], ResetConfirmDto.prototype, "newPassword", void 0);
class StepUpRequestDto {
    password;
    action;
    details;
}
exports.StepUpRequestDto = StepUpRequestDto;
__decorate([
    (0, swagger_1.ApiProperty)(),
    (0, class_transformer_1.Transform)(({ obj }) => obj.password),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MinLength)(1),
    (0, class_validator_1.MaxLength)(256),
    __metadata("design:type", String)
], StepUpRequestDto.prototype, "password", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ enum: ['TRANSFER', 'PAYOUT', 'BENEFICIARY', 'ADMIN'] }),
    (0, class_validator_1.IsIn)(['TRANSFER', 'PAYOUT', 'BENEFICIARY', 'ADMIN']),
    __metadata("design:type", String)
], StepUpRequestDto.prototype, "action", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        type: 'object',
        additionalProperties: true,
        example: { beneficiaryId: 'YOUR_UUID', amount: '100.00' },
    }),
    (0, class_validator_1.IsObject)(),
    __metadata("design:type", Object)
], StepUpRequestDto.prototype, "details", void 0);
//# sourceMappingURL=security.dto.js.map