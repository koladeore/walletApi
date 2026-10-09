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
exports.PayoutsController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const jwt_auth_guard_1 = require("../auth/guards/jwt-auth.guard");
const payout_dto_1 = require("./payout.dto");
const payouts_service_1 = require("./payouts.service");
const step_up_guard_1 = require("../security/step-up.guard");
let PayoutsController = class PayoutsController {
    payouts;
    constructor(payouts) {
        this.payouts = payouts;
    }
    create(req, dto, key) {
        return this.payouts.create(req.user.id, dto.beneficiaryId, dto.amount, key, req.stepUpAuthVersion);
    }
    list(req) {
        return this.payouts.list(req.user.id);
    }
    get(req, reference) {
        return this.payouts.get(req.user.id, reference);
    }
    verify(req, reference) {
        return this.payouts.verify(reference, req.user.id);
    }
};
exports.PayoutsController = PayoutsController;
__decorate([
    (0, common_1.Post)(),
    (0, step_up_guard_1.SensitiveAction)('PAYOUT'),
    (0, swagger_1.ApiHeader)({ name: 'x-idempotency-key', required: true }),
    (0, swagger_1.ApiOperation)({ summary: 'Reserve funds and request a Paystack test payout' }),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Body)()),
    __param(2, (0, common_1.Headers)('x-idempotency-key')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, payout_dto_1.PayoutDto, String]),
    __metadata("design:returntype", void 0)
], PayoutsController.prototype, "create", null);
__decorate([
    (0, common_1.Get)(),
    (0, swagger_1.ApiOperation)({ summary: 'List your latest 100 payouts' }),
    __param(0, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], PayoutsController.prototype, "list", null);
__decorate([
    (0, common_1.Get)(':reference'),
    (0, swagger_1.ApiOperation)({ summary: 'Read your payout status' }),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Param)('reference')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", void 0)
], PayoutsController.prototype, "get", null);
__decorate([
    (0, common_1.Post)(':reference/verify'),
    (0, common_1.HttpCode)(200),
    (0, swagger_1.ApiOperation)({ summary: 'Check payout outcome with Paystack; never resubmit a transfer' }),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Param)('reference')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", void 0)
], PayoutsController.prototype, "verify", null);
exports.PayoutsController = PayoutsController = __decorate([
    (0, swagger_1.ApiTags)('payouts'),
    (0, swagger_1.ApiBearerAuth)(),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard),
    (0, common_1.Controller)('wallet/payouts'),
    __metadata("design:paramtypes", [payouts_service_1.PayoutsService])
], PayoutsController);
//# sourceMappingURL=payouts.controller.js.map