// Run against a migrated, disposable database named wallet_ledger_test* only.
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { ConfigService } = require('@nestjs/config');
const { PrismaService } = require('../../src/prisma/prisma.service');
const { FundingService } = require('../../src/funding/funding.service');

async function main() {
  const url = process.env.LEDGER_TEST_DATABASE_URL;
  if (!url || !new URL(url).pathname.startsWith('/wallet_ledger_test'))
    throw new Error('Use a migrated disposable LEDGER_TEST_DATABASE_URL named wallet_ledger_test*');
  const prisma = new PrismaService(new ConfigService({ DATABASE_URL: url }));
  await prisma.$connect();
  try {
    const id = randomUUID();
    const user = await prisma.user.create({ data: { email: `funding-${id}@example.com`, password: 'test', wallet: { create: {} } }, include: { wallet: true } });
    const before = await prisma.ledgerJournal.count();
    let calls = 0;
    let release;
    let reached;
    const providerReached = new Promise(resolve => { reached = resolve; });
    const providerResult = new Promise(resolve => { release = resolve; });
    const provider = {
      assertEnabled() {},
      async initializePayment(input) {
        calls++;
        const saved = await prisma.fundingRequest.findUniqueOrThrow({ where: { reference: input.reference } });
        assert.equal(saved.expectedEmail, user.email);
        assert.equal(saved.amountMinor, 10050n);
        assert.equal(saved.walletId, user.wallet.id);
        reached();
        return providerResult;
      },
    };
    const service = new FundingService(prisma, provider);
    const first = service.initialize(user.id, '100.50', 'same-key');
    await providerReached;
    const retries = await Promise.allSettled(Array.from({ length: 5 }, () => service.initialize(user.id, '100.50', 'same-key')));
    assert.equal(retries.filter(result => result.status === 'rejected').length, 5);
    release({ authorizationUrl: 'https://checkout.paystack.com/test', accessCode: 'code' });
    const result = await first;
    assert.equal(result.status, 'PENDING');
    assert.deepEqual(await service.initialize(user.id, '100.50', 'same-key'), result);
    assert.equal(calls, 1);
    assert.equal(await prisma.fundingRequest.count({ where: { userId: user.id } }), 1);
    await assert.rejects(() => service.initialize(user.id, '101', 'same-key'));
    await assert.rejects(() => service.get('other-user', result.reference));
    assert.equal((await prisma.wallet.findUniqueOrThrow({ where: { id: user.wallet.id } })).balanceMinor, 0n);
    assert.equal(await prisma.ledgerJournal.count(), before);
    assert.equal(await prisma.transaction.count({ where: { receiverWalletId: user.wallet.id } }), 0);

    provider.initializePayment = async () => { calls++; throw new Error('timeout'); };
    await assert.rejects(() => service.initialize(user.id, '1', 'uncertain-key'));
    await assert.rejects(() => service.initialize(user.id, '1', 'uncertain-key'));
    assert.equal(calls, 2);
    assert.equal((await prisma.fundingRequest.findUniqueOrThrow({ where: { userId_idempotencyKey: { userId: user.id, idempotencyKey: 'uncertain-key' } } })).status, 'INITIALIZATION_UNKNOWN');
    await assert.rejects(() => prisma.fundingRequest.create({ data: { reference: randomUUID(), idempotencyKey: 'invalid-currency', userId: user.id, walletId: user.wallet.id, expectedEmail: user.email, amountMinor: 1n, currency: 'USD' } }));
    console.log('Funding database integration passed: persistence before provider I/O, concurrent retries, replay, ownership, uncertain initialization, currency constraint, and unchanged ledger/wallet.');
  } finally {
    await prisma.$disconnect();
  }
}
main().catch(() => { console.error('Funding database integration failed'); process.exitCode = 1; });
