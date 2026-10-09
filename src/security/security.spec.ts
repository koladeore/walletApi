import { describeAction } from './actions';
import { decryptDelivery, encryptDelivery, secretHash } from './crypto';

describe('Security credential primitives', () => {
  const secret = 'test-security-secret-77e93b1b4fd7089c';
  it('encrypts delivery content and rejects a wrong key or tampered payload', () => {
    const payload = { code: '123456', challengeId: 'test' };
    const encrypted = encryptDelivery(secret, payload);
    expect(encrypted).not.toContain('123456');
    expect(decryptDelivery(secret, encrypted)).toEqual(payload);
    expect(() => decryptDelivery('different-secret', encrypted)).toThrow();
    const parts = encrypted.split('.');
    parts[1] = '0'.repeat(32);
    expect(() => decryptDelivery(secret, parts.join('.'))).toThrow();
  });
  it('binds hashes to challenge identity', () => {
    expect(secretHash(secret, 'code:one:123456')).not.toBe(secretHash(secret, 'code:two:123456'));
  });
  it('normalizes exact minor units without weakening recipient binding', () => {
    const first = describeAction('TRANSFER', {
      receiverEmail: 'Owner@example.com',
      amount: '100.00',
    });
    expect(
      describeAction('TRANSFER', { receiverEmail: 'Owner@example.com', amount: '100' }).binding,
    ).toBe(first.binding);
    expect(
      describeAction('TRANSFER', { receiverEmail: 'owner@example.com', amount: '100' }).binding,
    ).not.toBe(first.binding);
    expect(
      describeAction('TRANSFER', { receiverEmail: 'Owner@example.com', amount: '101' }).binding,
    ).not.toBe(first.binding);
  });
  it('binds beneficiary bank and account exactly', () => {
    const binding = describeAction('BENEFICIARY', {
      bankCode: '035A',
      accountNumber: '0001234567',
    }).binding;
    expect(
      describeAction('BENEFICIARY', { bankCode: '035A', accountNumber: '0001234568' }).binding,
    ).not.toBe(binding);
  });
  it('canonicalizes staff request bodies but binds path and method', () => {
    const details = {
      method: 'PATCH',
      path: '/api/v1/users/user-id/status',
      body: { reason: 'Account review', isActive: false },
    };
    const binding = describeAction('ADMIN', details).binding;
    expect(
      describeAction('ADMIN', { ...details, body: { isActive: false, reason: 'Account review' } })
        .binding,
    ).toBe(binding);
    expect(
      describeAction('ADMIN', { ...details, path: '/api/v1/users/other-id/status' }).binding,
    ).not.toBe(binding);
  });
  it.each([
    ['PAYOUT', { beneficiaryId: 'bad', amount: '100' }],
    ['TRANSFER', { receiverEmail: 'owner@example.com', amount: 100 }],
    ['BENEFICIARY', { bankCode: '058', accountNumber: '123' }],
    [
      'ADMIN',
      { method: 'POST', path: 'https://evil.example/api/v1/users/user-id/status', body: {} },
    ],
  ] as const)('rejects invalid %s action details', (action, details) => {
    expect(() => describeAction(action, details)).toThrow();
  });
});
