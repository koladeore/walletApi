// Run against a migrated, disposable database named wallet_ledger_test* only.
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { ConfigService } = require('@nestjs/config');
const { PrismaService } = require('../../src/prisma/prisma.service');
const { FundingService } = require('../../src/funding/funding.service');
const { ConfirmationService } = require('../../src/funding/confirmation.service');
const { WebhookService } = require('../../src/funding/webhook.service');
const { PaystackService } = require('../../src/paystack/paystack.service');
const { createHmac } = require('node:crypto');

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
    let verified = { reference: result.reference, amountMinor: '10050', currency: 'NGN', domain: 'test', status: 'success', email: user.email, transactionId: '123456' };
    const verifier = { verifyPayment: async () => verified };
    const confirmation = new ConfirmationService(prisma, verifier);
    for (const change of [{ amountMinor: '10051' }, { currency: 'USD' }, { domain: 'live' }, { email: 'wrong@example.com' }, { reference: 'other' }]) {
      const correct = verified;
      verified = { ...verified, ...change };
      await assert.rejects(() => confirmation.confirm(result.reference, user.id));
      verified = correct;
      assert.equal((await prisma.wallet.findUniqueOrThrow({ where: { id: user.wallet.id } })).balanceMinor, 0n);
    }
    // Force a failed write and prove status, ledger, and wallet all roll back together.
    await assert.rejects(() => prisma.$transaction(async tx => {
      await tx.fundingRequest.update({ where: { reference: result.reference }, data: { status: 'SUCCESS', providerTransactionId: verified.transactionId, verifiedAt: new Date() } });
    }));
    assert.equal((await prisma.fundingRequest.findUniqueOrThrow({ where: { reference: result.reference } })).status, 'PENDING');
    const credits = await Promise.all(Array.from({ length: 5 }, () => confirmation.confirm(result.reference, user.id)));
    assert.ok(credits.every(x => x.status === 'SUCCESS'));
    const confirmed = credits[0];
    assert.equal((await prisma.wallet.findUniqueOrThrow({ where: { id: user.wallet.id } })).balanceMinor, 10050n);
    assert.equal(await prisma.transaction.count({ where: { receiverWalletId: user.wallet.id } }), 1);
    const entries = await prisma.ledgerEntry.findMany({ where: { journalId: 'transaction:funding:' + confirmed.id } });
    assert.equal(entries.length, 2);
    assert.ok(entries.some(x => x.side === 'DEBIT' && x.accountId === 'system:NGN:CLEARING' && x.amountMinor === 10050n));
    assert.ok(entries.some(x => x.side === 'CREDIT' && x.accountId === 'wallet:' + user.wallet.id && x.amountMinor === 10050n));
    await assert.rejects(() => prisma.fundingRequest.update({ where: { id: confirmed.id }, data: { expectedEmail: 'changed@example.com' } }));
    await assert.rejects(() => prisma.fundingRequest.update({ where: { id: confirmed.id }, data: { status: 'PENDING' } }));

    const key = 'sk_test_example123';
    const paystack = new PaystackService(new ConfigService({ PAYSTACK_ENABLED: 'true', PAYSTACK_SECRET_KEY: key }));
    const webhook = new WebhookService(prisma, paystack, confirmation);
    const raw = Buffer.from(JSON.stringify({ event: 'charge.success', data: { id: 123456, reference: result.reference, amount: 10050, currency: 'NGN', domain: 'test', status: 'success', customer: { email: user.email } } }));
    const signature = createHmac('sha512', key).update(raw).digest('hex');
    await assert.rejects(() => webhook.receive(raw, 'bad'));
    await Promise.all(Array.from({ length: 5 }, () => webhook.receive(raw, signature)));
    const events = await prisma.paystackEvent.findMany({ where: { reference: result.reference } });
    assert.equal(events.length, 1);
    await Promise.all(Array.from({ length: 5 }, () => webhook.process(events[0].id)));
    assert.equal((await prisma.paystackEvent.findUniqueOrThrow({ where: { id: events[0].id } })).status, 'PROCESSED');
    assert.equal((await prisma.wallet.findUniqueOrThrow({ where: { id: user.wallet.id } })).balanceMinor, 10050n);
    await prisma.$queryRaw`SELECT ledger_assert_wallet(${user.wallet.id})::text`;
    console.log('Funding database integration passed: initialization, signature validation, mismatches, concurrent credits, duplicate events, immutable expectations, atomic rollback, and balanced provider clearing entries.');
  } finally {
    await prisma.$disconnect();
  }
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
