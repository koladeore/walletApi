import { Injectable, ServiceUnavailableException } from '@nestjs/common';
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
