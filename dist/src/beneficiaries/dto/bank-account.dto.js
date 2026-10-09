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
exports.BankAccountDto = void 0;
const class_transformer_1 = require("class-transformer");
const class_validator_1 = require("class-validator");
const swagger_1 = require("@nestjs/swagger");
class BankAccountDto {
    bankCode;
    accountNumber;
}
exports.BankAccountDto = BankAccountDto;
__decorate([
    (0, swagger_1.ApiProperty)({
        example: '058',
        description: 'Bank code from the banks endpoint; keep leading zeros',
    }),
    (0, class_transformer_1.Transform)(({ obj }) => obj.bankCode),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.Matches)(/^[A-Za-z0-9]{2,20}$/),
    __metadata("design:type", String)
], BankAccountDto.prototype, "bankCode", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        example: '0001234567',
        description: 'Ten-digit Nigerian account number, as a string',
    }),
    (0, class_transformer_1.Transform)(({ obj }) => obj.accountNumber),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.Matches)(/^\d{10}$/),
    __metadata("design:type", String)
], BankAccountDto.prototype, "accountNumber", void 0);
//# sourceMappingURL=bank-account.dto.js.map