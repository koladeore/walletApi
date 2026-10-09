import { BadRequestException, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { parsePayment, record } from './payment';

@Injectable()
export class PaystackService {
  constructor(private readonly config: ConfigService) {}

  assertEnabled(): void {
    if (this.config.get<string>('PAYSTACK_ENABLED') !== 'true')
      throw new ServiceUnavailableException('Paystack integration is disabled');
    if (!/^sk_test_[A-Za-z0-9]+$/.test(this.config.get<string>('PAYSTACK_SECRET_KEY') ?? ''))
      throw new ServiceUnavailableException('Paystack test credentials are not configured');
  }

  private async bankRequest(path: string): Promise<Record<string, unknown>> {
    this.assertEnabled();
    try {
      const response = await fetch(`https://api.paystack.co${path}`, {
        headers: {
          Authorization: `Bearer ${this.config.getOrThrow<string>('PAYSTACK_SECRET_KEY')}`,
          Accept: 'application/json',
        },
        redirect: 'error',
        signal: AbortSignal.timeout(10_000),
      });
      if ([400, 404, 422].includes(response.status))
        throw new BadRequestException('Bank account details could not be verified');
      if (!response.ok) throw new Error('Provider unavailable');
      const body = record(await response.json());
      if (body.status !== true)
        throw new BadRequestException('Bank account details could not be verified');
      return body;
    } catch (error) {
      if (
        error instanceof BadRequestException &&
        error.message === 'Bank account details could not be verified'
      )
        throw error;
      throw new ServiceUnavailableException('Paystack bank verification is unavailable');
    }
  }

  async listBanks(page = 1) {
    if (!Number.isInteger(page) || page < 1 || page > 100)
      throw new BadRequestException('Invalid bank list page');
    const body = await this.bankRequest('/bank?country=nigeria&currency=NGN&type=nuban');
    try {
      if (!Array.isArray(body.data)) throw new Error('Invalid banks response');
      const banks = body.data.map((value: unknown) => {
        const bank = record(value);
        if (
          typeof bank.name !== 'string' ||
          !bank.name.trim() ||
          typeof bank.code !== 'string' ||
          !/^[A-Za-z0-9]{2,20}$/.test(bank.code) ||
          bank.currency !== 'NGN' ||
          bank.country !== 'Nigeria' ||
          typeof bank.active !== 'boolean'
        )
          throw new Error('Invalid bank');
        return { name: bank.name, code: bank.code, active: bank.active };
      });
      // Paystack currently returns the complete Nigerian list despite pagination parameters.
      const active = banks.filter((bank) => bank.active);
      return {
        banks: active.slice((page - 1) * 100, page * 100),
        page,
        nextPage: active.length > page * 100 ? page + 1 : null,
      };
    } catch {
      throw new ServiceUnavailableException('Paystack bank list is unavailable');
    }
  }

  async resolveBankAccount(accountNumber: string, bankCode: string) {
    if (!/^\d{10}$/.test(accountNumber) || !/^[A-Za-z0-9]{2,20}$/.test(bankCode))
      throw new BadRequestException('Invalid bank account details');
    const query = new URLSearchParams({ account_number: accountNumber, bank_code: bankCode });
    const body = await this.bankRequest(`/bank/resolve?${query.toString()}`);
    try {
      const data = record(body.data);
      if (
        data.account_number !== accountNumber ||
        typeof data.account_name !== 'string' ||
        !data.account_name.trim() ||
        data.account_name.length > 200
      )
        throw new Error('Invalid resolved account');
      return { accountNumber, bankCode, accountName: data.account_name.trim() };
    } catch {
      throw new ServiceUnavailableException('Paystack returned invalid bank account details');
    }
  }

  authenticateWebhook(raw: Buffer | undefined, signature: string | undefined): boolean {
    this.assertEnabled();
    if (!raw || typeof signature !== 'string' || !/^[a-fA-F0-9]{128}$/.test(signature))
      return false;
    const expected = createHmac('sha512', this.config.getOrThrow<string>('PAYSTACK_SECRET_KEY'))
      .update(raw)
      .digest();
    return timingSafeEqual(expected, Buffer.from(signature, 'hex'));
  }

  async verifyPayment(reference: string) {
    this.assertEnabled();
    try {
      const response = await fetch(
        `https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`,
        {
          headers: {
            Authorization: `Bearer ${this.config.getOrThrow<string>('PAYSTACK_SECRET_KEY')}`,
            Accept: 'application/json',
          },
          signal: AbortSignal.timeout(10_000),
          redirect: 'error',
        },
      );
      if (!response.ok) throw new Error('Provider rejected verification');
      const body = record(await response.json());
      if (body.status !== true) throw new Error('Provider verification failed');
      return parsePayment(body.data);
    } catch {
      throw new ServiceUnavailableException('Paystack payment verification is unavailable');
    }
  }

  async initializePayment(input: {
    email: string;
    amountMinor: bigint;
    currency: 'NGN';
    reference: string;
  }) {
    this.assertEnabled();
    try {
      const response = await fetch('https://api.paystack.co/transaction/initialize', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.config.getOrThrow<string>('PAYSTACK_SECRET_KEY')}`,
          Accept: 'application/json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email: input.email,
          amount: input.amountMinor.toString(),
          currency: input.currency,
          reference: input.reference,
        }),
        signal: AbortSignal.timeout(10_000),
        redirect: 'error',
      });
      if (!response.ok) throw new Error('Provider rejected initialization');
      const body: unknown = await response.json();
      if (
        !body ||
        typeof body !== 'object' ||
        !('status' in body) ||
        body.status !== true ||
        !('data' in body)
      )
        throw new Error('Invalid provider response');
      const data = body.data;
      if (
        !data ||
        typeof data !== 'object' ||
        !('reference' in data) ||
        data.reference !== input.reference ||
        !('authorization_url' in data) ||
        typeof data.authorization_url !== 'string' ||
        !('access_code' in data) ||
        typeof data.access_code !== 'string' ||
        !data.access_code
      )
        throw new Error('Invalid checkout response');
      const url = new URL(data.authorization_url);
      if (
        url.protocol !== 'https:' ||
        url.hostname !== 'checkout.paystack.com' ||
        url.username ||
        url.password ||
        url.port
      )
        throw new Error('Invalid checkout URL');
      return { authorizationUrl: data.authorization_url, accessCode: data.access_code };
    } catch {
      throw new ServiceUnavailableException(
        'Paystack payment initialization could not be confirmed',
      );
    }
  }

  /** Explicit, read-only credential check; never runs automatically at startup. */
  async checkConnection(): Promise<void> {
    this.assertEnabled();
    const key = this.config.get<string>('PAYSTACK_SECRET_KEY');

    try {
      const response = await fetch('https://api.paystack.co/balance', {
        method: 'GET',
        headers: { Authorization: `Bearer ${key}`, Accept: 'application/json' },
        signal: AbortSignal.timeout(10_000),
        redirect: 'error',
      });
      if (!response.ok) throw new Error('Provider rejected request');
      const body: unknown = await response.json();
      if (!body || typeof body !== 'object' || !('status' in body) || body.status !== true)
        throw new Error('Invalid provider response');
    } catch {
      // Never propagate provider bodies, headers, or network errors containing credentials.
      throw new ServiceUnavailableException('Paystack connection check failed');
    }
  }
}
