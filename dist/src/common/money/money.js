"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MAX_MINOR = void 0;
exports.parseNaira = parseNaira;
exports.formatMinor = formatMinor;
exports.walletResponse = walletResponse;
exports.transactionResponse = transactionResponse;
const common_1 = require("@nestjs/common");
exports.MAX_MINOR = 9223372036854775807n;
function parseNaira(value) {
    if (typeof value !== 'string' || value.length > 20 || !/^(0|[1-9]\d*)(\.\d{1,2})?$/.test(value)) {
        throw new common_1.BadRequestException('amount must be a naira string with at most two decimal places');
    }
    const [whole, fraction = ''] = value.split('.');
    const minor = BigInt(whole) * 100n + BigInt(fraction.padEnd(2, '0'));
    if (minor <= 0n || minor > exports.MAX_MINOR)
        throw new common_1.BadRequestException('Amount is outside the supported range');
    return minor;
}
function formatMinor(value) {
    const sign = value < 0n ? '-' : '';
    const absolute = value < 0n ? -value : value;
    return `${sign}${absolute / 100n}.${(absolute % 100n).toString().padStart(2, '0')}`;
}
function walletResponse(wallet) {
    return {
        ...wallet,
        balanceMinor: wallet.balanceMinor.toString(),
        balance: formatMinor(wallet.balanceMinor),
        reservedMinor: (wallet.reservedMinor ?? 0n).toString(),
        reservedBalance: formatMinor(wallet.reservedMinor ?? 0n),
        availableMinor: (wallet.balanceMinor - (wallet.reservedMinor ?? 0n)).toString(),
        availableBalance: formatMinor(wallet.balanceMinor - (wallet.reservedMinor ?? 0n)),
    };
}
function transactionResponse(transaction) {
    return {
        ...transaction,
        amountMinor: transaction.amountMinor.toString(),
        amount: formatMinor(transaction.amountMinor),
    };
}
//# sourceMappingURL=money.js.map