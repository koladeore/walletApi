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
exports.UsersController = void 0;
const financial_reason_dto_1 = require("../common/dto/financial-reason.dto");
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const users_service_1 = require("./users.service");
const jwt_auth_guard_1 = require("../auth/guards/jwt-auth.guard");
const admin_guard_1 = require("../auth/guards/admin.guard");
const recipient_lookup_dto_1 = require("./dto/recipient-lookup.dto");
const update_user_status_dto_1 = require("./dto/update-user-status.dto");
let UsersController = class UsersController {
    usersService;
    constructor(usersService) {
        this.usersService = usersService;
    }
    async getAllUsers() {
        return this.usersService.getAllUsers();
    }
    async getProfile(req) {
        const user = await this.usersService.getProfile(req.user.id);
        if (!user) {
            throw new common_1.NotFoundException('User profile not found');
        }
        return user;
    }
    async getWallet(req) {
        const wallet = await this.usersService.getWallet(req.user.id);
        if (!wallet) {
            throw new common_1.NotFoundException('Wallet not found');
        }
        return wallet;
    }
    async lookupRecipient(dto) {
        const recipient = await this.usersService.lookupRecipient(dto.email);
        if (!recipient)
            throw new common_1.NotFoundException('Recipient not found');
        return recipient;
    }
    async getUserById(id) {
        const user = await this.usersService.getProfile(id);
        if (!user) {
            throw new common_1.NotFoundException('User not found');
        }
        return user;
    }
    closeAccount(req, id, dto) {
        return this.usersService.closeAccount(req.user.id, id, dto.reason);
    }
    updateStatus(req, id, dto) {
        return this.usersService.updateStatus(req.user.id, id, dto);
    }
};
exports.UsersController = UsersController;
__decorate([
    (0, common_1.Get)(),
    (0, common_1.UseGuards)(admin_guard_1.AdminGuard),
    (0, swagger_1.ApiOperation)({ summary: 'Get all users (admin only)' }),
    (0, swagger_1.ApiResponse)({ status: 403, description: 'Administrator access required.' }),
    (0, swagger_1.ApiResponse)({ status: 200, description: 'User profiles retrieved successfully.' }),
    (0, swagger_1.ApiResponse)({ status: 401, description: 'Unauthorized.' }),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], UsersController.prototype, "getAllUsers", null);
__decorate([
    (0, common_1.Get)('profile'),
    (0, swagger_1.ApiOperation)({ summary: 'Get current user profile' }),
    (0, swagger_1.ApiResponse)({ status: 200, description: 'User profile retrieved successfully.' }),
    (0, swagger_1.ApiResponse)({ status: 401, description: 'Unauthorized.' }),
    __param(0, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], UsersController.prototype, "getProfile", null);
__decorate([
    (0, common_1.Get)('wallet'),
    (0, swagger_1.ApiOperation)({ summary: 'Get current user wallet balance' }),
    (0, swagger_1.ApiResponse)({ status: 200, description: 'Wallet retrieved successfully.' }),
    (0, swagger_1.ApiResponse)({ status: 401, description: 'Unauthorized.' }),
    __param(0, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], UsersController.prototype, "getWallet", null);
__decorate([
    (0, common_1.Post)('recipient-lookup'),
    (0, common_1.HttpCode)(200),
    (0, swagger_1.ApiOperation)({ summary: 'Look up an active wallet recipient by exact email' }),
    (0, swagger_1.ApiResponse)({ status: 200, description: 'Recipient ID, first name and last name only.' }),
    (0, swagger_1.ApiResponse)({ status: 400, description: 'Invalid email.' }),
    (0, swagger_1.ApiResponse)({ status: 401, description: 'Unauthorized.' }),
    (0, swagger_1.ApiResponse)({ status: 404, description: 'Recipient not found.' }),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [recipient_lookup_dto_1.RecipientLookupDto]),
    __metadata("design:returntype", Promise)
], UsersController.prototype, "lookupRecipient", null);
__decorate([
    (0, common_1.Get)(':id'),
    (0, common_1.UseGuards)(admin_guard_1.AdminGuard),
    (0, swagger_1.ApiOperation)({ summary: 'Get user by ID (admin only)' }),
    (0, swagger_1.ApiResponse)({ status: 403, description: 'Administrator access required.' }),
    (0, swagger_1.ApiResponse)({ status: 200, description: 'User profile retrieved successfully.' }),
    (0, swagger_1.ApiResponse)({ status: 400, description: 'Invalid user ID.' }),
    (0, swagger_1.ApiResponse)({ status: 401, description: 'Unauthorized.' }),
    (0, swagger_1.ApiResponse)({ status: 404, description: 'User not found.' }),
    __param(0, (0, common_1.Param)('id', new common_1.ParseUUIDPipe())),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], UsersController.prototype, "getUserById", null);
__decorate([
    (0, common_1.Post)(':id/close'),
    (0, common_1.UseGuards)(admin_guard_1.AdminGuard),
    (0, common_1.HttpCode)(200),
    (0, swagger_1.ApiOperation)({
        summary: 'Permanently close a settled account while retaining history (admin only)',
    }),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Param)('id', new common_1.ParseUUIDPipe())),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, financial_reason_dto_1.FinancialReasonDto]),
    __metadata("design:returntype", void 0)
], UsersController.prototype, "closeAccount", null);
__decorate([
    (0, common_1.Patch)(':id/status'),
    (0, common_1.UseGuards)(admin_guard_1.AdminGuard),
    (0, swagger_1.ApiOperation)({ summary: 'Activate or deactivate a user (admin only)' }),
    (0, swagger_1.ApiResponse)({ status: 200, description: 'Updated public user profile.' }),
    (0, swagger_1.ApiResponse)({ status: 400, description: 'Invalid request or self-deactivation.' }),
    (0, swagger_1.ApiResponse)({ status: 401, description: 'Unauthorized.' }),
    (0, swagger_1.ApiResponse)({ status: 403, description: 'Administrator access required.' }),
    (0, swagger_1.ApiResponse)({ status: 404, description: 'User not found.' }),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Param)('id', new common_1.ParseUUIDPipe())),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, update_user_status_dto_1.UpdateUserStatusDto]),
    __metadata("design:returntype", void 0)
], UsersController.prototype, "updateStatus", null);
exports.UsersController = UsersController = __decorate([
    (0, swagger_1.ApiTags)('users'),
    (0, swagger_1.ApiBearerAuth)(),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard),
    (0, common_1.Controller)('users'),
    __metadata("design:paramtypes", [users_service_1.UsersService])
], UsersController);
//# sourceMappingURL=users.controller.js.map