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
exports.BeneficiariesController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const jwt_auth_guard_1 = require("../auth/guards/jwt-auth.guard");
const beneficiaries_service_1 = require("./beneficiaries.service");
const bank_account_dto_1 = require("./dto/bank-account.dto");
const bank_list_query_dto_1 = require("./dto/bank-list-query.dto");
let BeneficiariesController = class BeneficiariesController {
    beneficiaries;
    constructor(beneficiaries) {
        this.beneficiaries = beneficiaries;
    }
    banks(req, query) {
        return this.beneficiaries.banks(req.user.id, query.page);
    }
    resolve(req, dto) {
        return this.beneficiaries.resolve(req.user.id, dto);
    }
    create(req, dto) {
        return this.beneficiaries.create(req.user.id, dto);
    }
    list(req) {
        return this.beneficiaries.list(req.user.id);
    }
    get(req, id) {
        return this.beneficiaries.get(req.user.id, id);
    }
};
exports.BeneficiariesController = BeneficiariesController;
__decorate([
    (0, common_1.Get)('banks'),
    (0, swagger_1.ApiOperation)({ summary: 'List Nigerian banks and codes for NGN beneficiaries' }),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Query)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, bank_list_query_dto_1.BankListQueryDto]),
    __metadata("design:returntype", void 0)
], BeneficiariesController.prototype, "banks", null);
__decorate([
    (0, common_1.Post)('resolve'),
    (0, common_1.HttpCode)(200),
    (0, swagger_1.ApiOperation)({ summary: 'Preview the account name verified by Paystack (does not save)' }),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, bank_account_dto_1.BankAccountDto]),
    __metadata("design:returntype", void 0)
], BeneficiariesController.prototype, "resolve", null);
__decorate([
    (0, common_1.Post)(),
    (0, swagger_1.ApiOperation)({ summary: 'Verify and save a beneficiary; duplicate bank details reuse its ID' }),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, bank_account_dto_1.BankAccountDto]),
    __metadata("design:returntype", void 0)
], BeneficiariesController.prototype, "create", null);
__decorate([
    (0, common_1.Get)(),
    (0, swagger_1.ApiOperation)({ summary: 'List your beneficiaries with masked account numbers' }),
    __param(0, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], BeneficiariesController.prototype, "list", null);
__decorate([
    (0, common_1.Get)(':id'),
    (0, swagger_1.ApiOperation)({ summary: 'Read one of your beneficiaries' }),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", void 0)
], BeneficiariesController.prototype, "get", null);
exports.BeneficiariesController = BeneficiariesController = __decorate([
    (0, swagger_1.ApiTags)('beneficiaries'),
    (0, swagger_1.ApiBearerAuth)(),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard),
    (0, common_1.Controller)('beneficiaries'),
    __metadata("design:paramtypes", [beneficiaries_service_1.BeneficiariesService])
], BeneficiariesController);
//# sourceMappingURL=beneficiaries.controller.js.map