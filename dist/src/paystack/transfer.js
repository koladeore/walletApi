"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.parseTransferNotice = parseTransferNotice;
exports.parseVerifiedTransfer = parseVerifiedTransfer;
const payment_1 = require("./payment");
function parseTransferNotice(value) {
    const data = (0, payment_1.record)(value);
    const text = (value) => {
        if (typeof value !== 'string' || !value)
            throw new Error('Invalid transfer');
        return value;
    };
    if (typeof data.amount !== 'number' || !Number.isSafeInteger(data.amount) || data.amount <= 0)
        throw new Error('Invalid transfer amount');
    const transferCode = text(data.transfer_code);
    if (!/^TRF_[A-Za-z0-9]+$/.test(transferCode))
        throw new Error('Invalid transfer code');
    return {
        reference: text(data.reference),
        amountMinor: String(data.amount),
        currency: text(data.currency),
        domain: text(data.domain),
        status: text(data.status),
        transferCode,
    };
}
function parseVerifiedTransfer(value) {
    const notice = parseTransferNotice(value);
    const recipient = (0, payment_1.record)((0, payment_1.record)(value).recipient);
    const details = (0, payment_1.record)(recipient.details);
    if (recipient.domain !== 'test' ||
        recipient.currency !== 'NGN' ||
        recipient.type !== 'nuban' ||
        typeof recipient.recipient_code !== 'string' ||
        !/^RCP_[A-Za-z0-9]+$/.test(recipient.recipient_code) ||
        typeof details.bank_code !== 'string' ||
        typeof details.account_number !== 'string')
        throw new Error('Invalid recipient');
    return {
        ...notice,
        recipientCode: recipient.recipient_code,
        bankCode: details.bank_code,
        accountNumber: details.account_number,
        ...((0, payment_1.record)(value).fee_charged !== null && (0, payment_1.record)(value).fee_charged !== undefined
            ? { feeMinor: (0, payment_1.parseFee)((0, payment_1.record)(value).fee_charged) }
            : {}),
    };
}
//# sourceMappingURL=transfer.js.map