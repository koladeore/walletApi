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
exports.PaystackService = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
let PaystackService = class PaystackService {
    config;
    constructor(config) {
        this.config = config;
    }
    async checkConnection() {
        const key = this.config.get('PAYSTACK_SECRET_KEY');
        if (this.config.get('PAYSTACK_ENABLED') !== 'true')
            throw new common_1.ServiceUnavailableException('Paystack integration is disabled');
        if (!key || !/^sk_test_[A-Za-z0-9]+$/.test(key))
            throw new common_1.ServiceUnavailableException('Paystack test credentials are not configured');
        try {
            const response = await fetch('https://api.paystack.co/balance', {
                method: 'GET',
                headers: { Authorization: `Bearer ${key}`, Accept: 'application/json' },
                signal: AbortSignal.timeout(10_000),
                redirect: 'error',
            });
            if (!response.ok)
                throw new Error('Provider rejected request');
            const body = await response.json();
            if (!body || typeof body !== 'object' || !('status' in body) || body.status !== true)
                throw new Error('Invalid provider response');
        }
        catch {
            throw new common_1.ServiceUnavailableException('Paystack connection check failed');
        }
    }
};
exports.PaystackService = PaystackService;
exports.PaystackService = PaystackService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [config_1.ConfigService])
], PaystackService);
//# sourceMappingURL=paystack.service.js.map