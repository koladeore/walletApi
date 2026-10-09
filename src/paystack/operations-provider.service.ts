import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PaystackService } from './paystack.service';
import { parsePayment, record } from './payment';
import type { PaystackPayment } from './payment';

export function providerId(value: unknown): string {
  const text = typeof value === 'number' && Number.isSafeInteger(value) ? String(value) : value;
  if (typeof text !== 'string' || !/^[1-9]\d{0,19}$/.test(text))
    throw new Error('Invalid provider identifier');
  return text;
}
export function providerMinor(value: unknown): bigint {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0)
    throw new Error('Invalid provider amount');
  return BigInt(value);
}
export interface VerifiedCase {
  kind: 'REFUND' | 'DISPUTE';
  providerId: string;
  transaction: PaystackPayment;
  amountMinor: bigint;
  status: string;
  resolution: string | null;
  disputeId: string | null;
}

@Injectable()
export class OperationsProviderService {
  constructor(
    private readonly config: ConfigService,
    private readonly paystack: PaystackService,
  ) {}
  private async request(path: string) {
    this.paystack.assertEnabled();
    const response = await fetch(`https://api.paystack.co${path}`, {
      headers: {
        Authorization: `Bearer ${this.config.getOrThrow<string>('PAYSTACK_SECRET_KEY')}`,
        Accept: 'application/json',
      },
      redirect: 'error',
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) throw new Error('Provider unavailable');
    const body = record(await response.json());
    if (body.status !== true) throw new Error('Provider response unavailable');
    return body;
  }
  async fetchCase(kind: 'REFUND' | 'DISPUTE', id: string): Promise<VerifiedCase> {
    try {
      const data = record(
        (await this.request(`/${kind === 'REFUND' ? 'refund' : 'dispute'}/${providerId(id)}`)).data,
      );
      if (providerId(data.id) !== id || typeof data.status !== 'string')
        throw new Error('Provider case mismatch');
      const transactionId = providerId(
        typeof data.transaction === 'object' ? record(data.transaction).id : data.transaction,
      );
      const transaction = parsePayment((await this.request(`/transaction/${transactionId}`)).data);
      if (
        transaction.domain !== 'test' ||
        transaction.currency !== 'NGN' ||
        transaction.status !== 'success' ||
        transaction.transactionId !== transactionId ||
        (data.domain !== undefined && data.domain !== 'test') ||
        (data.currency !== null && data.currency !== undefined && data.currency !== 'NGN')
      )
        throw new Error('Case mode mismatch');
      const amount =
        kind === 'REFUND'
          ? providerMinor(data.amount)
          : data.refund_amount === null || data.refund_amount === undefined
            ? 0n
            : providerMinor(data.refund_amount);
      if (amount > BigInt(transaction.amountMinor)) throw new Error('Case amount mismatch');
      return {
        kind,
        providerId: id,
        transaction,
        amountMinor: amount,
        status: data.status,
        resolution: typeof data.resolution === 'string' ? data.resolution : null,
        disputeId: data.dispute
          ? providerId(typeof data.dispute === 'object' ? record(data.dispute).id : data.dispute)
          : null,
      };
    } catch {
      throw new ServiceUnavailableException('Paystack financial case verification is unavailable');
    }
  }
  async inventory(resource: 'transaction' | 'transfer' | 'refund' | 'dispute') {
    try {
      const rows: Record<string, unknown>[] = [];
      for (let page = 1; page <= 100; page++) {
        const body = await this.request(`/${resource}?perPage=100&page=${page}`);
        if (!Array.isArray(body.data)) throw new Error('Invalid inventory');
        const items = body.data.map((value) => record(value));
        rows.push(...items);
        const meta = body.meta && typeof body.meta === 'object' ? record(body.meta) : null;
        if (meta && typeof meta.pageCount === 'number' && Number.isSafeInteger(meta.pageCount)) {
          if (page >= meta.pageCount) return rows;
        } else if (items.length < 100) return rows;
      }
      throw new Error('Inventory incomplete');
    } catch {
      throw new ServiceUnavailableException('Paystack inventory unavailable or incomplete');
    }
  }
  async balance(): Promise<bigint> {
    try {
      const data = (await this.request('/balance')).data;
      if (!Array.isArray(data)) throw new Error('Invalid balance');
      const ngn = data.map((value) => record(value)).filter((value) => value.currency === 'NGN');
      if (ngn.length !== 1) throw new Error('NGN balance missing');
      return providerMinor(ngn[0].balance);
    } catch {
      throw new ServiceUnavailableException('Paystack balance unavailable');
    }
  }
}
