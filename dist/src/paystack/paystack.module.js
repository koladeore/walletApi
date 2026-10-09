"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.PaystackModule = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const paystack_service_1 = require("./paystack.service");
const payout_provider_service_1 = require("./payout-provider.service");
let PaystackModule = class PaystackModule {
};
exports.PaystackModule = PaystackModule;
exports.PaystackModule = PaystackModule = __decorate([
    (0, common_1.Module)({
        imports: [config_1.ConfigModule],
        providers: [paystack_service_1.PaystackService, payout_provider_service_1.PayoutProviderService],
        exports: [paystack_service_1.PaystackService, payout_provider_service_1.PayoutProviderService],
    })
], PaystackModule);
//# sourceMappingURL=paystack.module.js.map