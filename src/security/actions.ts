import { createHash } from 'node:crypto';
import { BadRequestException } from '@nestjs/common';
import { isEmail, isUUID } from 'class-validator';
import { parseNaira } from '../common/money/money';

export type SecurityAction = 'TRANSFER' | 'PAYOUT' | 'BENEFICIARY' | 'ADMIN';
function stable(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === 'object')
    return Object.fromEntries(
      Object.entries(value)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, v]) => [k, stable(v)]),
    );
  return value;
}
export function describeAction(action: SecurityAction, details: Record<string, unknown>) {
  const invalid = () => {
    throw new BadRequestException('Invalid step-up action details');
  };
  const fields = (keys: string[]) => {
    if (Object.keys(details).some((key) => !keys.includes(key))) invalid();
  };
  let values: unknown[];
  let summary: string;
  if (action === 'TRANSFER') {
    fields(['receiverEmail', 'amount']);
    if (typeof details.receiverEmail !== 'string' || !isEmail(details.receiverEmail)) invalid();
    const amount = parseNaira(details.amount).toString();
    values = [action, details.receiverEmail, amount];
    summary = `Transfer ${amount} kobo to ${String(details.receiverEmail)}`;
  } else if (action === 'PAYOUT') {
    fields(['beneficiaryId', 'amount']);
    if (typeof details.beneficiaryId !== 'string' || !isUUID(details.beneficiaryId)) invalid();
    const amount = parseNaira(details.amount).toString();
    values = [action, details.beneficiaryId, amount];
    summary = `Payout ${amount} kobo to beneficiary ${String(details.beneficiaryId)}`;
  } else if (action === 'BENEFICIARY') {
    fields(['bankCode', 'accountNumber']);
    if (
      typeof details.bankCode !== 'string' ||
      !/^[A-Za-z0-9]{2,20}$/.test(details.bankCode) ||
      typeof details.accountNumber !== 'string' ||
      !/^\d{10}$/.test(details.accountNumber)
    )
      invalid();
    values = [action, details.bankCode, details.accountNumber];
    summary = `Save bank ${String(details.bankCode)}, account ending ${String(details.accountNumber).slice(-4)}`;
  } else if (action === 'ADMIN') {
    fields(['method', 'path', 'body']);
    if (
      typeof details.method !== 'string' ||
      !['POST', 'PATCH'].includes(details.method) ||
      typeof details.path !== 'string' ||
      !details.body ||
      typeof details.body !== 'object' ||
      Array.isArray(details.body)
    )
      invalid();
    let path: string;
    try {
      path = decodeURIComponent(String(details.path));
    } catch {
      return invalid();
    }
    if (
      !/^\/api\/v1\/(users\/[^/]+\/(close|status)|wallet\/transactions\/[^/]+\/reverse|admin\/notification-deliveries\/[^/]+\/retry|admin\/account-controls\/(users\/[^/]+\/(tier|freeze)|flags\/[^/]+\/resolve)|admin\/financial-operations\/(issues\/[^/]+\/resolve|wallets\/[^/]+\/unfreeze|reconcile))$/.test(
        path,
      )
    )
      invalid();
    values = [action, details.method, path, stable(details.body)];
    summary = `Staff action ${String(details.method)} ${path}`;
  } else return invalid();
  const serialized = JSON.stringify(values);
  if (serialized.length > 4096) invalid();
  return { binding: createHash('sha256').update(serialized).digest('hex'), summary };
}
