import { ConfigService } from '@nestjs/config';
import { PaystackService } from './paystack.service';

describe('Paystack test integration', () => {
  const key = 'sk_test_example123';
  let fetchMock: jest.SpiedFunction<typeof fetch>;
  const service = (enabled = 'true', secret = key) =>
    new PaystackService(
      new ConfigService({ PAYSTACK_ENABLED: enabled, PAYSTACK_SECRET_KEY: secret }),
    );

  beforeEach(() => {
    fetchMock = jest.spyOn(globalThis, 'fetch');
  });
  afterEach(() => jest.restoreAllMocks());

  it('authenticates a read-only request over HTTPS without following redirects', async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ status: true, data: [] })));
    await expect(service().checkConnection()).resolves.toBeUndefined();
    expect(fetchMock).toHaveBeenCalledWith('https://api.paystack.co/balance', {
      method: 'GET',
      headers: { Authorization: `Bearer ${key}`, Accept: 'application/json' },
      signal: expect.any(AbortSignal) as AbortSignal,
      redirect: 'error',
    });
  });

  it.each([
    ['false', key],
    ['true', ''],
    ['true', 'sk_live_private'],
  ])('fails closed for disabled or invalid configuration (%s)', async (enabled, secret) => {
    await expect(service(enabled, secret).checkConnection()).rejects.toThrow();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([
    new Response('private provider error', { status: 401 }),
    new Response(JSON.stringify({ status: false })),
    new Response('invalid json'),
    new Response('null'),
  ])('returns a sanitized error for provider failures', async (response) => {
    fetchMock.mockResolvedValue(response);
    await expect(service().checkConnection()).rejects.toThrow('Paystack connection check failed');
  });

  it('sanitizes network failures and timeouts', async () => {
    fetchMock.mockRejectedValue(new Error(`network error ${key}`));
    await expect(service().checkConnection()).rejects.toThrow('Paystack connection check failed');
  });
});
