"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.record = record;
exports.parsePayment = parsePayment;
const common_1 = require("@nestjs/common");
function record(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value))
        throw new common_1.BadRequestException('Malformed Paystack payment');
    return value;
}
function parsePayment(value) {
    const data = record(value);
    const customer = record(data.customer);
    const string = (value) => {
        if (typeof value !== 'string' || !value)
            throw new common_1.BadRequestException('Malformed Paystack payment');
        return value;
    };
    if (typeof data.amount !== 'number' || !Number.isSafeInteger(data.amount) || data.amount <= 0)
        throw new common_1.BadRequestException('Malformed Paystack payment amount');
    const id = typeof data.id === 'number' && Number.isSafeInteger(data.id) && data.id > 0
        ? String(data.id)
        : data.id;
    if (typeof id !== 'string' || !/^[1-9]\d{0,19}$/.test(id) || BigInt(id) > 18446744073709551615n)
        throw new common_1.BadRequestException('Malformed Paystack transaction ID');
    return {
        reference: string(data.reference),
        amountMinor: String(data.amount),
        currency: string(data.currency),
        domain: string(data.domain),
        status: string(data.status),
        email: string(customer.email),
        transactionId: id,
    };
}
//# sourceMappingURL=payment.js.map