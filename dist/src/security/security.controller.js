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
exports.SecurityController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const jwt_auth_guard_1 = require("../auth/guards/jwt-auth.guard");
const security_service_1 = require("./security.service");
const security_dto_1 = require("./security.dto");
let SecurityController = class SecurityController {
    security;
    constructor(security) {
        this.security = security;
    }
    status(req) {
        return this.security.status(req.user.id);
    }
    emailRequest(req) {
        return this.security.requestEmail(req.user.id);
    }
    emailConfirm(req, dto) {
        return this.security.confirmEmail(req.user.id, dto.challengeId, dto.code);
    }
    resetRequest(dto) {
        return this.security.requestReset(dto.email);
    }
    reset(dto) {
        return this.security.resetPassword(dto.challengeId, dto.code, dto.newPassword);
    }
    stepRequest(req, dto) {
        return this.security.requestStepUp(req.user.id, dto.password, dto.action, dto.details);
    }
    stepConfirm(req, dto) {
        return this.security.confirmStepUp(req.user.id, dto.challengeId, dto.code);
    }
};
exports.SecurityController = SecurityController;
__decorate([
    (0, common_1.Get)('status'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard),
    (0, swagger_1.ApiBearerAuth)(),
    (0, swagger_1.ApiOperation)({ summary: 'Read your email verification status' }),
    __param(0, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], SecurityController.prototype, "status", null);
__decorate([
    (0, common_1.Post)('email/request'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard),
    (0, swagger_1.ApiBearerAuth)(),
    (0, swagger_1.ApiOperation)({ summary: 'Deliver a single-use email verification code' }),
    __param(0, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], SecurityController.prototype, "emailRequest", null);
__decorate([
    (0, common_1.Post)('email/confirm'),
    (0, common_1.HttpCode)(200),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard),
    (0, swagger_1.ApiBearerAuth)(),
    (0, swagger_1.ApiOperation)({ summary: 'Confirm email with the delivered code' }),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, security_dto_1.CodeDto]),
    __metadata("design:returntype", void 0)
], SecurityController.prototype, "emailConfirm", null);
__decorate([
    (0, common_1.Post)('password/request-reset'),
    (0, common_1.HttpCode)(200),
    (0, swagger_1.ApiOperation)({
        summary: 'Request password recovery; response does not disclose account existence',
    }),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [security_dto_1.ResetRequestDto]),
    __metadata("design:returntype", void 0)
], SecurityController.prototype, "resetRequest", null);
__decorate([
    (0, common_1.Post)('password/reset'),
    (0, common_1.HttpCode)(200),
    (0, swagger_1.ApiOperation)({ summary: 'Use a reset code and invalidate previous sessions' }),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [security_dto_1.ResetConfirmDto]),
    __metadata("design:returntype", void 0)
], SecurityController.prototype, "reset", null);
__decorate([
    (0, common_1.Post)('step-up/request'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard),
    (0, swagger_1.ApiBearerAuth)(),
    (0, swagger_1.ApiOperation)({
        summary: 'Confirm password and request an email code for an exact sensitive action',
    }),
    (0, swagger_1.ApiBody)({
        type: security_dto_1.StepUpRequestDto,
        examples: {
            payout: {
                summary: 'Approve an exact payout',
                value: {
                    password: 'YOUR_CURRENT_PASSWORD',
                    action: 'PAYOUT',
                    details: { beneficiaryId: 'de305d54-75b4-431b-adb2-eb6b9e546014', amount: '100.00' },
                },
            },
            transfer: {
                summary: 'Approve an internal transfer',
                value: {
                    password: 'YOUR_CURRENT_PASSWORD',
                    action: 'TRANSFER',
                    details: { receiverEmail: 'recipient@example.com', amount: '100.00' },
                },
            },
            beneficiary: {
                summary: 'Approve saving bank details',
                value: {
                    password: 'YOUR_CURRENT_PASSWORD',
                    action: 'BENEFICIARY',
                    details: { bankCode: '058', accountNumber: '0001234567' },
                },
            },
            admin: {
                summary: 'Approve an exact staff request',
                value: {
                    password: 'YOUR_CURRENT_PASSWORD',
                    action: 'ADMIN',
                    details: {
                        method: 'PATCH',
                        path: '/api/v1/users/de305d54-75b4-431b-adb2-eb6b9e546014/status',
                        body: { isActive: false, reason: 'Account investigation' },
                    },
                },
            },
        },
    }),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, security_dto_1.StepUpRequestDto]),
    __metadata("design:returntype", void 0)
], SecurityController.prototype, "stepRequest", null);
__decorate([
    (0, common_1.Post)('step-up/confirm'),
    (0, common_1.HttpCode)(200),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard),
    (0, swagger_1.ApiBearerAuth)(),
    (0, swagger_1.ApiOperation)({ summary: 'Exchange the email code for a single-use 5-minute action proof' }),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, security_dto_1.CodeDto]),
    __metadata("design:returntype", void 0)
], SecurityController.prototype, "stepConfirm", null);
exports.SecurityController = SecurityController = __decorate([
    (0, swagger_1.ApiTags)('account-security'),
    (0, common_1.Controller)('auth/security'),
    __metadata("design:paramtypes", [security_service_1.SecurityService])
], SecurityController);
//# sourceMappingURL=security.controller.js.map