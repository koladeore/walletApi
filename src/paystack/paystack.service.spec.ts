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

  const input = {
    email: 'owner@example.com',
    amountMinor: 10050n,
    currency: 'NGN' as const,
    reference: 'fund-test123',
  };
  const checkout = {
    reference: input.reference,
    authorization_url: 'https://checkout.paystack.com/test',
    access_code: 'code',
  };

  it('initializes exact expected payment details and validates the returned reference', async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ status: true, data: checkout })));
    await expect(service().initializePayment(input)).resolves.toEqual({
      authorizationUrl: checkout.authorization_url,
      accessCode: 'code',
    });
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.paystack.co/transaction/initialize',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          email: input.email,
          amount: '10050',
          currency: 'NGN',
          reference: input.reference,
        }),
        headers: {
          Authorization: `Bearer ${key}`,
          Accept: 'application/json',
          'Content-Type': 'application/json',
        },
        redirect: 'error',
      }),
    );
  });

  it.each([
    { ...checkout, reference: 'wrong-reference' },
    { ...checkout, authorization_url: 'https://evil.example/test' },
    { ...checkout, authorization_url: 'http://checkout.paystack.com/test' },
    { ...checkout, authorization_url: 'https://private@checkout.paystack.com/test' },
    { ...checkout, access_code: '' },
  ])('rejects malformed checkout responses', async (data) => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ status: true, data })));
    await expect(service().initializePayment(input)).rejects.toThrow('could not be confirmed');
  });

  it('sanitizes initialization network failures', async () => {
    fetchMock.mockRejectedValue(new Error(`private error ${key}`));
    await expect(service().initializePayment(input)).rejects.toThrow(
      'Paystack payment initialization could not be confirmed',
    );
  });
});
