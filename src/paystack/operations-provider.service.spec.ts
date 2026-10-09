import { ConfigService } from '@nestjs/config';
import { PaystackService } from './paystack.service';
import { OperationsProviderService } from './operations-provider.service';

describe('Verified financial records', () => {
  const config = new ConfigService({
    PAYSTACK_ENABLED: 'true',
    PAYSTACK_SECRET_KEY: 'sk_test_example123',
  });
  const service = new OperationsProviderService(config, new PaystackService(config));
  const transaction = {
    id: 123,
    reference: 'fund-test',
    amount: 10000,
    currency: 'NGN',
    domain: 'test',
    status: 'success',
    customer: { email: 'owner@example.com' },
    fees: 100,
  };
  let fetchMock: jest.SpiedFunction<typeof fetch>;
  const response = (data: unknown) => new Response(JSON.stringify({ status: true, data }));
  beforeEach(() => {
    fetchMock = jest.spyOn(globalThis, 'fetch');
  });
  afterEach(() => jest.restoreAllMocks());
  it('fetches a refund and independently verifies its funding transaction', async () => {
    fetchMock
      .mockResolvedValueOnce(
        response({
          id: 55,
          transaction: 123,
          amount: 5000,
          status: 'processed',
          currency: 'NGN',
          dispute: null,
        }),
      )
      .mockResolvedValueOnce(response(transaction));
    await expect(service.fetchCase('REFUND', '55')).resolves.toMatchObject({
      amountMinor: 5000n,
      transaction: { reference: 'fund-test', transactionId: '123', feeMinor: '100' },
    });
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      'https://api.paystack.co/transaction/123',
      expect.objectContaining({ redirect: 'error' }),
    );
  });
  it('retains the shared chargeback identity of a linked refund', async () => {
    fetchMock
      .mockResolvedValueOnce(
        response({
          id: 55,
          transaction: { id: 123 },
          amount: 5000,
          status: 'processed',
          dispute: 77,
        }),
      )
      .mockResolvedValueOnce(response(transaction));
    expect((await service.fetchCase('REFUND', '55')).disputeId).toBe('77');
  });
  it('verifies accepted dispute amounts against the funding transaction', async () => {
    fetchMock
      .mockResolvedValueOnce(
        response({
          id: 77,
          domain: 'test',
          transaction: { id: 123 },
          refund_amount: 4000,
          status: 'resolved',
          resolution: 'merchant-accepted',
        }),
      )
      .mockResolvedValueOnce(response(transaction));
    await expect(service.fetchCase('DISPUTE', '77')).resolves.toMatchObject({
      amountMinor: 4000n,
      resolution: 'merchant-accepted',
    });
  });
  it.each([
    { ...transaction, domain: 'live' },
    { ...transaction, currency: 'USD' },
    { ...transaction, id: 124 },
  ])('fails closed on mismatched funding details', async (data) => {
    fetchMock
      .mockResolvedValueOnce(
        response({ id: 55, transaction: 123, amount: 5000, status: 'processed' }),
      )
      .mockResolvedValueOnce(response(data));
    await expect(service.fetchCase('REFUND', '55')).rejects.toThrow('verification is unavailable');
  });
  it('rejects refunds exceeding the original payment', async () => {
    fetchMock
      .mockResolvedValueOnce(
        response({ id: 55, transaction: 123, amount: 10001, status: 'processed' }),
      )
      .mockResolvedValueOnce(response(transaction));
    await expect(service.fetchCase('REFUND', '55')).rejects.toThrow();
  });
  it('sanitizes provider errors', async () => {
    fetchMock.mockRejectedValue(new Error('private sk_test_example123'));
    await expect(service.fetchCase('REFUND', '55')).rejects.toThrow(
      'Paystack financial case verification is unavailable',
    );
  });
  it('collects every inventory page before claiming completeness', async () => {
    fetchMock
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ status: true, data: [{ id: 1 }], meta: { pageCount: 2 } })),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ status: true, data: [{ id: 2 }], meta: { pageCount: 2 } })),
      );
    await expect(service.inventory('refund')).resolves.toEqual([{ id: 1 }, { id: 2 }]);
  });
  it('treats failed inventory pages as incomplete, not empty', async () => {
    fetchMock.mockResolvedValue(new Response('offline', { status: 500 }));
    await expect(service.inventory('transfer')).rejects.toThrow('incomplete');
  });
  it('reads the exact NGN provider balance', async () => {
    fetchMock.mockResolvedValue(response([{ currency: 'NGN', balance: 12345 }]));
    await expect(service.balance()).resolves.toBe(12345n);
  });
});
