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
exports.PayoutProviderService = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const paystack_service_1 = require("./paystack.service");
const payment_1 = require("./payment");
const transfer_1 = require("./transfer");
let PayoutProviderService = class PayoutProviderService {
    config;
    paystack;
    constructor(config, paystack) {
        this.config = config;
        this.paystack = paystack;
    }
    async request(path, body) {
        this.paystack.assertEnabled();
        const response = await fetch(`https://api.paystack.co${path}`, {
            method: body ? 'POST' : 'GET',
            headers: {
                Authorization: `Bearer ${this.config.getOrThrow('PAYSTACK_SECRET_KEY')}`,
                'Content-Type': 'application/json',
                Accept: 'application/json',
            },
            ...(body ? { body: JSON.stringify(body) } : {}),
            redirect: 'error',
            signal: AbortSignal.timeout(10_000),
        });
        if (!response.ok)
            throw new Error('Provider request unavailable');
        const result = (0, payment_1.record)(await response.json());
        if (result.status !== true)
            throw new Error('Provider request not confirmed');
        return result.data;
    }
    async createRecipient(input) {
        try {
            const data = (0, payment_1.record)(await this.request('/transferrecipient', {
                type: 'nuban',
                name: input.accountName,
                account_number: input.accountNumber,
                bank_code: input.bankCode,
                currency: 'NGN',
            }));
            const details = (0, payment_1.record)(data.details);
            if (data.domain !== 'test' ||
                data.currency !== 'NGN' ||
                data.type !== 'nuban' ||
                data.active !== true ||
                details.account_number !== input.accountNumber ||
                details.bank_code !== input.bankCode ||
                typeof data.recipient_code !== 'string' ||
                !/^RCP_[A-Za-z0-9]+$/.test(data.recipient_code))
                throw new Error('Recipient mismatch');
            return data.recipient_code;
        }
        catch {
            throw new common_1.ServiceUnavailableException('Paystack recipient could not be confirmed');
        }
    }
    async initiate(input) {
        try {
            if (input.amountMinor <= 0n ||
                input.amountMinor > BigInt(Number.MAX_SAFE_INTEGER) ||
                !/^[a-z0-9_-]{16,50}$/.test(input.reference))
                throw new Error('Invalid payout');
            return (0, transfer_1.parseTransferNotice)(await this.request('/transfer', {
                source: 'balance',
                amount: Number(input.amountMinor),
                recipient: input.recipientCode,
                reference: input.reference,
                currency: 'NGN',
                reason: 'Wallet withdrawal',
            }));
        }
        catch {
            throw new common_1.ServiceUnavailableException('Paystack payout submission outcome is uncertain');
        }
    }
    async verify(reference) {
        try {
            return (0, transfer_1.parseVerifiedTransfer)(await this.request(`/transfer/verify/${encodeURIComponent(reference)}`));
        }
        catch {
            throw new common_1.ServiceUnavailableException('Paystack payout verification is unavailable');
        }
    }
};
exports.PayoutProviderService = PayoutProviderService;
exports.PayoutProviderService = PayoutProviderService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [config_1.ConfigService,
        paystack_service_1.PaystackService])
], PayoutProviderService);
//# sourceMappingURL=payout-provider.service.js.map