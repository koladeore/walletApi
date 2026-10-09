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
exports.StepUpGuard = exports.SensitiveAction = exports.RequiresStepUp = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const core_1 = require("@nestjs/core");
const security_service_1 = require("./security.service");
const RequiresStepUp = (action) => (0, common_1.SetMetadata)('securityAction', action);
exports.RequiresStepUp = RequiresStepUp;
const SensitiveAction = (action) => (0, common_1.applyDecorators)((0, exports.RequiresStepUp)(action), (0, common_1.UseGuards)(StepUpGuard), (0, swagger_1.ApiHeader)({
    name: 'x-step-up-token',
    required: true,
    description: 'Single-use proof from the account-security step-up flow, bound to this exact action',
}));
exports.SensitiveAction = SensitiveAction;
let StepUpGuard = class StepUpGuard {
    reflector;
    security;
    constructor(reflector, security) {
        this.reflector = reflector;
        this.security = security;
    }
    async canActivate(context) {
        const action = this.reflector.getAllAndOverride('securityAction', [
            context.getHandler(),
            context.getClass(),
        ]);
        if (!action)
            return true;
        const req = context.switchToHttp().getRequest();
        const body = (req.body ?? {});
        const details = action === 'ADMIN'
            ? { method: req.method, path: req.originalUrl.split('?')[0], body }
            : action === 'TRANSFER'
                ? { receiverEmail: body.receiverEmail, amount: body.amount }
                : action === 'PAYOUT'
                    ? { beneficiaryId: body.beneficiaryId, amount: body.amount }
                    : { bankCode: body.bankCode, accountNumber: body.accountNumber };
        const header = req.headers['x-step-up-token'];
        req.stepUpAuthVersion = await this.security.authorize(req.user.id, typeof header === 'string' ? header : undefined, action, details);
        return true;
    }
};
exports.StepUpGuard = StepUpGuard;
exports.StepUpGuard = StepUpGuard = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [core_1.Reflector,
        security_service_1.SecurityService])
], StepUpGuard);
//# sourceMappingURL=step-up.guard.js.map