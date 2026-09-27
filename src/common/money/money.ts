import { BadRequestException } from '@nestjs/common';

export const MAX_MINOR = 9223372036854775807n;

export function parseNaira(value: unknown): bigint {
  if (typeof value !== 'string' || value.length > 20 || !/^(0|[1-9]\d*)(\.\d{1,2})?$/.test(value)) {
    throw new BadRequestException('amount must be a naira string with at most two decimal places');
  }
  const [whole, fraction = ''] = value.split('.');
  const minor = BigInt(whole) * 100n + BigInt(fraction.padEnd(2, '0'));
  if (minor <= 0n || minor > MAX_MINOR)
    throw new BadRequestException('Amount is outside the supported range');
  return minor;
}

export function formatMinor(value: bigint): string {
  const sign = value < 0n ? '-' : '';
  const absolute = value < 0n ? -value : value;
  return `${sign}${absolute / 100n}.${(absolute % 100n).toString().padStart(2, '0')}`;
}

export function walletResponse<T extends { balanceMinor: bigint }>(wallet: T) {
  return {
    ...wallet,
    balanceMinor: wallet.balanceMinor.toString(),
    balance: formatMinor(wallet.balanceMinor),
  };
}

export function transactionResponse<T extends { amountMinor: bigint }>(transaction: T) {
  return {
    ...transaction,
    amountMinor: transaction.amountMinor.toString(),
    amount: formatMinor(transaction.amountMinor),
  };
}
