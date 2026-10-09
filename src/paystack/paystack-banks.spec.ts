import { ConfigService } from '@nestjs/config';
import { PaystackService } from './paystack.service';

describe('Paystack bank verification', () => {
  const service = new PaystackService(
    new ConfigService({ PAYSTACK_ENABLED: 'true', PAYSTACK_SECRET_KEY: 'sk_test_example123' }),
  );
  let fetchMock: jest.SpiedFunction<typeof fetch>;
  beforeEach(() => {
    fetchMock = jest.spyOn(globalThis, 'fetch');
  });
  afterEach(() => jest.restoreAllMocks());
  it('resolves exact account details with authenticated HTTPS', async () => {
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          status: true,
          data: { account_number: '0001234567', account_name: ' VERIFIED NAME ' },
        }),
      ),
    );
    await expect(service.resolveBankAccount('0001234567', '058')).resolves.toEqual({
      accountNumber: '0001234567',
      bankCode: '058',
      accountName: 'VERIFIED NAME',
    });
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.paystack.co/bank/resolve?account_number=0001234567&bank_code=058',
      expect.objectContaining({
        redirect: 'error',
        headers: { Authorization: 'Bearer sk_test_example123', Accept: 'application/json' },
      }),
    );
  });
  it.each([
    { account_number: '9999999999', account_name: 'NAME' },
    { account_number: '0001234567', account_name: '' },
    null,
  ])('rejects malformed provider data %j', async (data) => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ status: true, data })));
    await expect(service.resolveBankAccount('0001234567', '058')).rejects.toThrow(
      'invalid bank account',
    );
  });
  it.each([400, 404, 422])('returns sanitized invalid-account errors (%s)', async (status) => {
    fetchMock.mockResolvedValue(new Response('private provider data', { status }));
    await expect(service.resolveBankAccount('0001234567', '058')).rejects.toThrow(
      'details could not be verified',
    );
  });
  it.each([401, 429, 500])('returns sanitized provider-unavailable errors (%s)', async (status) => {
    fetchMock.mockResolvedValue(new Response('private provider data', { status }));
    await expect(service.resolveBankAccount('0001234567', '058')).rejects.toThrow(
      'verification is unavailable',
    );
  });
  it('sanitizes network errors and does not expose secrets or account numbers', async () => {
    fetchMock.mockRejectedValue(new Error('sk_test_example123 0001234567'));
    await expect(service.resolveBankAccount('0001234567', '058')).rejects.toThrow(
      'Paystack bank verification is unavailable',
    );
  });
  it('lists bank codes as strings and excludes inactive banks', async () => {
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          status: true,
          data: [
            { name: 'Bank', code: '058', active: true, country: 'Nigeria', currency: 'NGN' },
            { name: 'Inactive', code: '044', active: false, country: 'Nigeria', currency: 'NGN' },
          ],
        }),
      ),
    );
    await expect(service.listBanks()).resolves.toEqual({
      banks: [{ name: 'Bank', code: '058', active: true }],
      page: 1,
      nextPage: null,
    });
  });
  it('fails closed on malformed bank lists', async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ status: true, data: [{ name: 'Bank', code: 58 }] })),
    );
    await expect(service.listBanks()).rejects.toThrow('bank list is unavailable');
  });
  it('preserves alphanumeric codes and paginates the complete list', async () => {
    const data = Array.from({ length: 101 }, () => ({
      name: 'Bank',
      code: '035A',
      active: true,
      country: 'Nigeria',
      currency: 'NGN',
    }));
    fetchMock.mockImplementation(() =>
      Promise.resolve(new Response(JSON.stringify({ status: true, data }))),
    );
    const first = await service.listBanks(1);
    expect(first.banks).toHaveLength(100);
    expect(first.banks[0].code).toBe('035A');
    expect(first.nextPage).toBe(2);
    expect((await service.listBanks(2)).banks).toHaveLength(1);
  });
  it('rejects unsafe account inputs before contacting the provider', async () => {
    await expect(service.resolveBankAccount('bad', '058')).rejects.toThrow();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
