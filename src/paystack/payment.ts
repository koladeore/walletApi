import { BadRequestException } from '@nestjs/common';

export interface PaystackPayment {
  reference: string;
  amountMinor: string;
  currency: string;
  domain: string;
  status: string;
  email: string;
  transactionId: string;
}

export function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new BadRequestException('Malformed Paystack payment');
  return value as Record<string, unknown>;
}

export function parsePayment(value: unknown): PaystackPayment {
  const data = record(value);
  const customer = record(data.customer);
  const string = (value: unknown): string => {
    if (typeof value !== 'string' || !value)
      throw new BadRequestException('Malformed Paystack payment');
    return value;
  };
  if (typeof data.amount !== 'number' || !Number.isSafeInteger(data.amount) || data.amount <= 0)
    throw new BadRequestException('Malformed Paystack payment amount');
  // Fail closed when JSON numeric IDs exceed exact integer precision.
  const id =
    typeof data.id === 'number' && Number.isSafeInteger(data.id) && data.id > 0
      ? String(data.id)
      : data.id;
  if (typeof id !== 'string' || !/^[1-9]\d{0,19}$/.test(id) || BigInt(id) > 18446744073709551615n)
    throw new BadRequestException('Malformed Paystack transaction ID');
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
