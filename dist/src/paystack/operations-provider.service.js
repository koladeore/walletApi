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
exports.OperationsProviderService = void 0;
exports.providerId = providerId;
exports.providerMinor = providerMinor;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const paystack_service_1 = require("./paystack.service");
const payment_1 = require("./payment");
function providerId(value) {
    const text = typeof value === 'number' && Number.isSafeInteger(value) ? String(value) : value;
    if (typeof text !== 'string' || !/^[1-9]\d{0,19}$/.test(text))
        throw new Error('Invalid provider identifier');
    return text;
}
function providerMinor(value) {
    if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0)
        throw new Error('Invalid provider amount');
    return BigInt(value);
}
let OperationsProviderService = class OperationsProviderService {
    config;
    paystack;
    constructor(config, paystack) {
        this.config = config;
        this.paystack = paystack;
    }
    async request(path) {
        this.paystack.assertEnabled();
        const response = await fetch(`https://api.paystack.co${path}`, {
            headers: {
                Authorization: `Bearer ${this.config.getOrThrow('PAYSTACK_SECRET_KEY')}`,
                Accept: 'application/json',
            },
            redirect: 'error',
            signal: AbortSignal.timeout(10_000),
        });
        if (!response.ok)
            throw new Error('Provider unavailable');
        const body = (0, payment_1.record)(await response.json());
        if (body.status !== true)
            throw new Error('Provider response unavailable');
        return body;
    }
    async fetchCase(kind, id) {
        try {
            const data = (0, payment_1.record)((await this.request(`/${kind === 'REFUND' ? 'refund' : 'dispute'}/${providerId(id)}`)).data);
            if (providerId(data.id) !== id || typeof data.status !== 'string')
                throw new Error('Provider case mismatch');
            const transactionId = providerId(typeof data.transaction === 'object' ? (0, payment_1.record)(data.transaction).id : data.transaction);
            const transaction = (0, payment_1.parsePayment)((await this.request(`/transaction/${transactionId}`)).data);
            if (transaction.domain !== 'test' ||
                transaction.currency !== 'NGN' ||
                transaction.status !== 'success' ||
                transaction.transactionId !== transactionId ||
                (data.domain !== undefined && data.domain !== 'test') ||
                (data.currency !== null && data.currency !== undefined && data.currency !== 'NGN'))
                throw new Error('Case mode mismatch');
            const amount = kind === 'REFUND'
                ? providerMinor(data.amount)
                : data.refund_amount === null || data.refund_amount === undefined
                    ? 0n
                    : providerMinor(data.refund_amount);
            if (amount > BigInt(transaction.amountMinor))
                throw new Error('Case amount mismatch');
            return {
                kind,
                providerId: id,
                transaction,
                amountMinor: amount,
                status: data.status,
                resolution: typeof data.resolution === 'string' ? data.resolution : null,
                disputeId: data.dispute
                    ? providerId(typeof data.dispute === 'object' ? (0, payment_1.record)(data.dispute).id : data.dispute)
                    : null,
            };
        }
        catch {
            throw new common_1.ServiceUnavailableException('Paystack financial case verification is unavailable');
        }
    }
    async inventory(resource) {
        try {
            const rows = [];
            for (let page = 1; page <= 100; page++) {
                const body = await this.request(`/${resource}?perPage=100&page=${page}`);
                if (!Array.isArray(body.data))
                    throw new Error('Invalid inventory');
                const items = body.data.map((value) => (0, payment_1.record)(value));
                rows.push(...items);
                const meta = body.meta && typeof body.meta === 'object' ? (0, payment_1.record)(body.meta) : null;
                if (meta && typeof meta.pageCount === 'number' && Number.isSafeInteger(meta.pageCount)) {
                    if (page >= meta.pageCount)
                        return rows;
                }
                else if (items.length < 100)
                    return rows;
            }
            throw new Error('Inventory incomplete');
        }
        catch {
            throw new common_1.ServiceUnavailableException('Paystack inventory unavailable or incomplete');
        }
    }
    async balance() {
        try {
            const data = (await this.request('/balance')).data;
            if (!Array.isArray(data))
                throw new Error('Invalid balance');
            const ngn = data.map((value) => (0, payment_1.record)(value)).filter((value) => value.currency === 'NGN');
            if (ngn.length !== 1)
                throw new Error('NGN balance missing');
            return providerMinor(ngn[0].balance);
        }
        catch {
            throw new common_1.ServiceUnavailableException('Paystack balance unavailable');
        }
    }
};
exports.OperationsProviderService = OperationsProviderService;
exports.OperationsProviderService = OperationsProviderService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [config_1.ConfigService,
        paystack_service_1.PaystackService])
], OperationsProviderService);
//# sourceMappingURL=operations-provider.service.js.map