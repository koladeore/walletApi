import { parsePayment } from './payment';

describe('Paystack payment parser', () => {
  const data = {
    id: 123,
    reference: 'fund-test',
    amount: 10050,
    currency: 'NGN',
    domain: 'test',
    status: 'success',
    customer: { email: 'owner@example.com' },
  };
  it('parses exact amount and transaction identifiers', () => {
    expect(parsePayment(data)).toMatchObject({
      amountMinor: '10050',
      transactionId: '123',
      email: 'owner@example.com',
    });
    expect(parsePayment({ ...data, id: '18446744073709551615' }).transactionId).toBe(
      '18446744073709551615',
    );
  });
  it.each([
    { amount: 1.5 },
    { amount: '10050' },
    { amount: 0 },
    { amount: Number.MAX_SAFE_INTEGER + 1 },
    { id: Number.MAX_SAFE_INTEGER + 1 },
    { id: '18446744073709551616' },
    { customer: null },
    { reference: '' },
  ])('rejects malformed or imprecise fields %j', (change) => {
    expect(() => parsePayment({ ...data, ...change })).toThrow();
  });
});
