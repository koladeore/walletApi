import { parseFee, record } from './payment';

export interface TransferNotice {
  reference: string;
  amountMinor: string;
  currency: string;
  domain: string;
  status: string;
  transferCode: string;
}
export interface VerifiedTransfer extends TransferNotice {
  feeMinor?: string;
  recipientCode: string;
  bankCode: string;
  accountNumber: string;
}
export function parseTransferNotice(value: unknown): TransferNotice {
  const data = record(value);
  const text = (value: unknown): string => {
    if (typeof value !== 'string' || !value) throw new Error('Invalid transfer');
    return value;
  };
  if (typeof data.amount !== 'number' || !Number.isSafeInteger(data.amount) || data.amount <= 0)
    throw new Error('Invalid transfer amount');
  const transferCode = text(data.transfer_code);
  if (!/^TRF_[A-Za-z0-9]+$/.test(transferCode)) throw new Error('Invalid transfer code');
  return {
    reference: text(data.reference),
    amountMinor: String(data.amount),
    currency: text(data.currency),
    domain: text(data.domain),
    status: text(data.status),
    transferCode,
  };
}
export function parseVerifiedTransfer(value: unknown): VerifiedTransfer {
  const notice = parseTransferNotice(value);
  const recipient = record(record(value).recipient);
  const details = record(recipient.details);
  if (
    recipient.domain !== 'test' ||
    recipient.currency !== 'NGN' ||
    recipient.type !== 'nuban' ||
    typeof recipient.recipient_code !== 'string' ||
    !/^RCP_[A-Za-z0-9]+$/.test(recipient.recipient_code) ||
    typeof details.bank_code !== 'string' ||
    typeof details.account_number !== 'string'
  )
    throw new Error('Invalid recipient');
  return {
    ...notice,
    recipientCode: recipient.recipient_code,
    bankCode: details.bank_code,
    accountNumber: details.account_number,
    ...(record(value).fee_charged !== null && record(value).fee_charged !== undefined
      ? { feeMinor: parseFee(record(value).fee_charged) }
      : {}),
  };
}
