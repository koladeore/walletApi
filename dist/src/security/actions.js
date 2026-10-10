"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.describeAction = describeAction;
const node_crypto_1 = require("node:crypto");
const common_1 = require("@nestjs/common");
const class_validator_1 = require("class-validator");
const money_1 = require("../common/money/money");
function stable(value) {
    if (Array.isArray(value))
        return value.map(stable);
    if (value && typeof value === 'object')
        return Object.fromEntries(Object.entries(value)
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([k, v]) => [k, stable(v)]));
    return value;
}
function describeAction(action, details) {
    const invalid = () => {
        throw new common_1.BadRequestException('Invalid step-up action details');
    };
    const fields = (keys) => {
        if (Object.keys(details).some((key) => !keys.includes(key)))
            invalid();
    };
    let values;
    let summary;
    if (action === 'TRANSFER') {
        fields(['receiverEmail', 'amount']);
        if (typeof details.receiverEmail !== 'string' || !(0, class_validator_1.isEmail)(details.receiverEmail))
            invalid();
        const amount = (0, money_1.parseNaira)(details.amount).toString();
        values = [action, details.receiverEmail, amount];
        summary = `Transfer ${amount} kobo to ${String(details.receiverEmail)}`;
    }
    else if (action === 'PAYOUT') {
        fields(['beneficiaryId', 'amount']);
        if (typeof details.beneficiaryId !== 'string' || !(0, class_validator_1.isUUID)(details.beneficiaryId))
            invalid();
        const amount = (0, money_1.parseNaira)(details.amount).toString();
        values = [action, details.beneficiaryId, amount];
        summary = `Payout ${amount} kobo to beneficiary ${String(details.beneficiaryId)}`;
    }
    else if (action === 'BENEFICIARY') {
        fields(['bankCode', 'accountNumber']);
        if (typeof details.bankCode !== 'string' ||
            !/^[A-Za-z0-9]{2,20}$/.test(details.bankCode) ||
            typeof details.accountNumber !== 'string' ||
            !/^\d{10}$/.test(details.accountNumber))
            invalid();
        values = [action, details.bankCode, details.accountNumber];
        summary = `Save bank ${String(details.bankCode)}, account ending ${String(details.accountNumber).slice(-4)}`;
    }
    else if (action === 'ADMIN') {
        fields(['method', 'path', 'body']);
        if (typeof details.method !== 'string' ||
            !['POST', 'PATCH'].includes(details.method) ||
            typeof details.path !== 'string' ||
            !details.body ||
            typeof details.body !== 'object' ||
            Array.isArray(details.body))
            invalid();
        let path;
        try {
            path = decodeURIComponent(String(details.path));
        }
        catch {
            return invalid();
        }
        if (!/^\/api\/v1\/(users\/[^/]+\/(close|status)|wallet\/transactions\/[^/]+\/reverse|admin\/notification-deliveries\/[^/]+\/retry|admin\/account-controls\/(users\/[^/]+\/(tier|freeze)|flags\/[^/]+\/resolve)|admin\/financial-operations\/(issues\/[^/]+\/resolve|wallets\/[^/]+\/unfreeze|reconcile))$/.test(path))
            invalid();
        values = [action, details.method, path, stable(details.body)];
        summary = `Staff action ${String(details.method)} ${path}`;
    }
    else
        return invalid();
    const serialized = JSON.stringify(values);
    if (serialized.length > 4096)
        invalid();
    return { binding: (0, node_crypto_1.createHash)('sha256').update(serialized).digest('hex'), summary };
}
//# sourceMappingURL=actions.js.map