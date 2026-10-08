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
exports.PaystackController = void 0;
const common_1 = require("@nestjs/common");
const throttler_1 = require("@nestjs/throttler");
const swagger_1 = require("@nestjs/swagger");
const webhook_service_1 = require("./webhook.service");
let PaystackController = class PaystackController {
    webhook;
    constructor(webhook) {
        this.webhook = webhook;
    }
    receive(req, signature) {
        return this.webhook.receive(req.rawBody, signature);
    }
    callback() {
        return {
            message: 'Checkout returned. Check your funding status or use the authenticated verify endpoint to confirm payment.',
        };
    }
};
exports.PaystackController = PaystackController;
__decorate([
    (0, common_1.Post)('webhook'),
    (0, common_1.HttpCode)(200),
    (0, throttler_1.SkipThrottle)(),
    (0, swagger_1.ApiOperation)({ summary: 'Paystack signed webhook (provider use only)' }),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Headers)('x-paystack-signature')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", void 0)
], PaystackController.prototype, "receive", null);
__decorate([
    (0, common_1.Get)('callback'),
    (0, swagger_1.ApiOperation)({ summary: 'Informational checkout callback; never credits wallets' }),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], PaystackController.prototype, "callback", null);
exports.PaystackController = PaystackController = __decorate([
    (0, swagger_1.ApiTags)('paystack'),
    (0, common_1.Controller)('paystack'),
    __metadata("design:paramtypes", [webhook_service_1.WebhookService])
], PaystackController);
//# sourceMappingURL=paystack.controller.js.map