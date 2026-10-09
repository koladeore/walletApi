import { ConfigService } from '@nestjs/config';
import { PaystackService } from './paystack.service';
import { PayoutProviderService } from './payout-provider.service';

describe('Paystack payout provider', () => {
  const config = new ConfigService({
    PAYSTACK_ENABLED: 'true',
    PAYSTACK_SECRET_KEY: 'sk_test_example123',
  });
  const provider = new PayoutProviderService(config, new PaystackService(config));
  const input = {
    reference: 'payout-1234567890123456',
    amountMinor: 10050n,
    recipientCode: 'RCP_test',
  };
  const data = {
    reference: input.reference,
    amount: 10050,
    currency: 'NGN',
    domain: 'test',
    status: 'pending',
    transfer_code: 'TRF_test',
    recipient: {
      recipient_code: 'RCP_test',
      domain: 'test',
      currency: 'NGN',
      type: 'nuban',
      details: { bank_code: '058', account_number: '0001234567' },
    },
  };
  let fetchMock: jest.SpiedFunction<typeof fetch>;
  beforeEach(() => {
    fetchMock = jest.spyOn(globalThis, 'fetch');
  });
  afterEach(() => jest.restoreAllMocks());
  it('submits exact minor units with the stored reference over HTTPS', async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ status: true, data })));
    await provider.initiate(input);
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.paystack.co/transfer',
      expect.objectContaining({
        method: 'POST',
        redirect: 'error',
        body: JSON.stringify({
          source: 'balance',
          amount: 10050,
          recipient: 'RCP_test',
          reference: input.reference,
          currency: 'NGN',
          reason: 'Wallet withdrawal',
        }),
      }),
    );
  });
  it('verifies recipient and account details by reference', async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ status: true, data })));
    await expect(provider.verify(input.reference)).resolves.toMatchObject({
      recipientCode: 'RCP_test',
      accountNumber: '0001234567',
      bankCode: '058',
    });
    expect(fetchMock).toHaveBeenCalledWith(
      `https://api.paystack.co/transfer/verify/${input.reference}`,
      expect.objectContaining({ method: 'GET' }),
    );
  });
  it('creates a matched test recipient', async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ status: true, data: { ...data.recipient, active: true } })),
    );
    await expect(
      provider.createRecipient({
        accountName: 'TEST',
        accountNumber: '0001234567',
        bankCode: '058',
      }),
    ).resolves.toBe('RCP_test');
  });
  it.each(['live', 'wrong-domain'])('rejects recipient mode %s', async (domain) => {
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({ status: true, data: { ...data.recipient, active: true, domain } }),
      ),
    );
    await expect(
      provider.createRecipient({
        accountName: 'TEST',
        accountNumber: '0001234567',
        bankCode: '058',
      }),
    ).rejects.toThrow('recipient could not be confirmed');
  });
  it('does not treat a 404 or failed verification response as permission to release money', async () => {
    fetchMock.mockResolvedValue(new Response('not found', { status: 404 }));
    await expect(provider.verify(input.reference)).rejects.toThrow('verification is unavailable');
  });
  it('sanitizes submission timeouts', async () => {
    fetchMock.mockRejectedValue(new Error('secret bank account private error'));
    await expect(provider.initiate(input)).rejects.toThrow('submission outcome is uncertain');
  });
  it('rejects imprecise provider amounts', async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ status: true, data: { ...data, amount: 100.5 } })),
    );
    await expect(provider.verify(input.reference)).rejects.toThrow('verification is unavailable');
  });
});
