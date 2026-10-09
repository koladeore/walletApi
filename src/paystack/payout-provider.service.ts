import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PaystackService } from './paystack.service';
import { record } from './payment';
import { parseTransferNotice, parseVerifiedTransfer } from './transfer';

@Injectable()
export class PayoutProviderService {
  constructor(
    private readonly config: ConfigService,
    private readonly paystack: PaystackService,
  ) {}
  private async request(path: string, body?: object): Promise<unknown> {
    this.paystack.assertEnabled();
    const response = await fetch(`https://api.paystack.co${path}`, {
      method: body ? 'POST' : 'GET',
      headers: {
        Authorization: `Bearer ${this.config.getOrThrow<string>('PAYSTACK_SECRET_KEY')}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
      redirect: 'error',
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) throw new Error('Provider request unavailable');
    const result = record(await response.json());
    if (result.status !== true) throw new Error('Provider request not confirmed');
    return result.data;
  }
  async createRecipient(input: { accountName: string; accountNumber: string; bankCode: string }) {
    try {
      const data = record(
        await this.request('/transferrecipient', {
          type: 'nuban',
          name: input.accountName,
          account_number: input.accountNumber,
          bank_code: input.bankCode,
          currency: 'NGN',
        }),
      );
      const details = record(data.details);
      if (
        data.domain !== 'test' ||
        data.currency !== 'NGN' ||
        data.type !== 'nuban' ||
        data.active !== true ||
        details.account_number !== input.accountNumber ||
        details.bank_code !== input.bankCode ||
        typeof data.recipient_code !== 'string' ||
        !/^RCP_[A-Za-z0-9]+$/.test(data.recipient_code)
      )
        throw new Error('Recipient mismatch');
      return data.recipient_code;
    } catch {
      throw new ServiceUnavailableException('Paystack recipient could not be confirmed');
    }
  }
  async initiate(input: { reference: string; amountMinor: bigint; recipientCode: string }) {
    try {
      if (
        input.amountMinor <= 0n ||
        input.amountMinor > BigInt(Number.MAX_SAFE_INTEGER) ||
        !/^[a-z0-9_-]{16,50}$/.test(input.reference)
      )
        throw new Error('Invalid payout');
      return parseTransferNotice(
        await this.request('/transfer', {
          source: 'balance',
          amount: Number(input.amountMinor),
          recipient: input.recipientCode,
          reference: input.reference,
          currency: 'NGN',
          reason: 'Wallet withdrawal',
        }),
      );
    } catch {
      throw new ServiceUnavailableException('Paystack payout submission outcome is uncertain');
    }
  }
  async verify(reference: string) {
    try {
      return parseVerifiedTransfer(
        await this.request(`/transfer/verify/${encodeURIComponent(reference)}`),
      );
    } catch {
      throw new ServiceUnavailableException('Paystack payout verification is unavailable');
    }
  }
}
