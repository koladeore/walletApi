import { ValidationPipe } from '@nestjs/common';
import { parseNaira, formatMinor, MAX_MINOR, walletResponse, transactionResponse } from './money';
import { FundWalletDto } from '../../wallet/dto/fund-wallet.dto';

describe('Exact NGN money', () => {
  it.each([
    ['0.01', 1n],
    ['100.50', 10050n],
    ['1.2', 120n],
    ['90071992547409.93', 9007199254740993n],
    ['92233720368547758.07', MAX_MINOR],
  ])('parses %s exactly', (value, expected) => {
    expect(parseNaira(value)).toBe(expected);
  });
  it.each([
    '0',
    '0.00',
    '-1',
    '1.001',
    '1e3',
    '1,000',
    ' 1',
    '01',
    '',
    'NaN',
    'Infinity',
    '92233720368547758.08',
    0.1,
    null,
  ])('rejects invalid amount %p', (value) => {
    expect(() => parseNaira(value)).toThrow();
  });
  it('adds fractional naira without rounding errors', () => {
    expect(formatMinor(parseNaira('0.10') + parseNaira('0.20'))).toBe('0.30');
  });
  it('serializes amounts above the JavaScript safe integer limit losslessly', () => {
    const value = 9007199254740993n;
    expect(JSON.parse(JSON.stringify(walletResponse({ balanceMinor: value })))).toEqual({
      balanceMinor: '9007199254740993',
      balance: '90071992547409.93',
      reservedMinor: '0',
      reservedBalance: '0.00',
      availableMinor: '9007199254740993',
      availableBalance: '90071992547409.93',
    });
    expect(transactionResponse({ amountMinor: value }).amount).toBe('90071992547409.93');
  });
  it('rejects JSON numbers even when implicit conversion is enabled', async () => {
    const pipe = new ValidationPipe({
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    });
    await expect(
      pipe.transform({ amount: 100.5 }, { type: 'body', metatype: FundWalletDto }),
    ).rejects.toThrow();
    await expect(
      pipe.transform({ amount: '100.50' }, { type: 'body', metatype: FundWalletDto }),
    ).resolves.toHaveProperty('amount', '100.50');
  });
});
