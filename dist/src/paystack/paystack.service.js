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
const node_crypto_1 = require("node:crypto");
const payment_1 = require("./payment");
let PaystackService = class PaystackService {
    config;
    constructor(config) {
        this.config = config;
    }
    assertEnabled() {
        if (this.config.get('PAYSTACK_ENABLED') !== 'true')
            throw new common_1.ServiceUnavailableException('Paystack integration is disabled');
        if (!/^sk_test_[A-Za-z0-9]+$/.test(this.config.get('PAYSTACK_SECRET_KEY') ?? ''))
            throw new common_1.ServiceUnavailableException('Paystack test credentials are not configured');
    }
    authenticateWebhook(raw, signature) {
        this.assertEnabled();
        if (!raw || typeof signature !== 'string' || !/^[a-fA-F0-9]{128}$/.test(signature))
            return false;
        const expected = (0, node_crypto_1.createHmac)('sha512', this.config.getOrThrow('PAYSTACK_SECRET_KEY'))
            .update(raw)
            .digest();
        return (0, node_crypto_1.timingSafeEqual)(expected, Buffer.from(signature, 'hex'));
    }
    async verifyPayment(reference) {
        this.assertEnabled();
        try {
            const response = await fetch(`https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`, {
                headers: {
                    Authorization: `Bearer ${this.config.getOrThrow('PAYSTACK_SECRET_KEY')}`,
                    Accept: 'application/json',
                },
                signal: AbortSignal.timeout(10_000),
                redirect: 'error',
            });
            if (!response.ok)
                throw new Error('Provider rejected verification');
            const body = (0, payment_1.record)(await response.json());
            if (body.status !== true)
                throw new Error('Provider verification failed');
            return (0, payment_1.parsePayment)(body.data);
        }
        catch {
            throw new common_1.ServiceUnavailableException('Paystack payment verification is unavailable');
        }
    }
    async initializePayment(input) {
        this.assertEnabled();
        try {
            const response = await fetch('https://api.paystack.co/transaction/initialize', {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${this.config.getOrThrow('PAYSTACK_SECRET_KEY')}`,
                    Accept: 'application/json',
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    email: input.email,
                    amount: input.amountMinor.toString(),
                    currency: input.currency,
                    reference: input.reference,
                }),
                signal: AbortSignal.timeout(10_000),
                redirect: 'error',
            });
            if (!response.ok)
                throw new Error('Provider rejected initialization');
            const body = await response.json();
            if (!body ||
                typeof body !== 'object' ||
                !('status' in body) ||
                body.status !== true ||
                !('data' in body))
                throw new Error('Invalid provider response');
            const data = body.data;
            if (!data ||
                typeof data !== 'object' ||
                !('reference' in data) ||
                data.reference !== input.reference ||
                !('authorization_url' in data) ||
                typeof data.authorization_url !== 'string' ||
                !('access_code' in data) ||
                typeof data.access_code !== 'string' ||
                !data.access_code)
                throw new Error('Invalid checkout response');
            const url = new URL(data.authorization_url);
            if (url.protocol !== 'https:' ||
                url.hostname !== 'checkout.paystack.com' ||
                url.username ||
                url.password ||
                url.port)
                throw new Error('Invalid checkout URL');
            return { authorizationUrl: data.authorization_url, accessCode: data.access_code };
        }
        catch {
            throw new common_1.ServiceUnavailableException('Paystack payment initialization could not be confirmed');
        }
    }
    async checkConnection() {
        this.assertEnabled();
        const key = this.config.get('PAYSTACK_SECRET_KEY');
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