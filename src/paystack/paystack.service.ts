import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class PaystackService {
  constructor(private readonly config: ConfigService) {}

  /** Explicit, read-only credential check; never runs automatically at startup. */
  async checkConnection(): Promise<void> {
    const key = this.config.get<string>('PAYSTACK_SECRET_KEY');
    if (this.config.get<string>('PAYSTACK_ENABLED') !== 'true')
      throw new ServiceUnavailableException('Paystack integration is disabled');
    // Also enforce test mode here for callers using configuration without validation.
    if (!key || !/^sk_test_[A-Za-z0-9]+$/.test(key))
      throw new ServiceUnavailableException('Paystack test credentials are not configured');

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
