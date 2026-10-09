const assert = require('node:assert/strict');
const { randomUUID, createHmac } = require('node:crypto');
const { ConfigService } = require('@nestjs/config');
const { PrismaService } = require('../../src/prisma/prisma.service');
const { WalletService } = require('../../src/wallet/wallet.service');
const { PayoutsService } = require('../../src/payouts/payouts.service');
const { PaystackService } = require('../../src/paystack/paystack.service');
const { WebhookService } = require('../../src/funding/webhook.service');

async function main() {
  const url = process.env.LEDGER_TEST_DATABASE_URL;
  if (!url || !new URL(url).pathname.startsWith('/wallet_ledger_test')) throw new Error('Use a migrated disposable LEDGER_TEST_DATABASE_URL named wallet_ledger_test*');
  const prisma = new PrismaService(new ConfigService({ DATABASE_URL: url }));
  await prisma.$connect();
  try {
    const config = new ConfigService({ NODE_ENV: 'test', ENABLE_SIMULATED_FUNDING: 'true', PAYSTACK_ENABLED: 'true', PAYSTACK_SECRET_KEY: 'sk_test_example123' });
    const paystack = new PaystackService(config);
    const user = await prisma.user.create({ data: { email: `payout-${randomUUID()}@example.com`, password: 'test', wallet: { create: {} } }, include: { wallet: true } });
    const beneficiary = await prisma.beneficiary.create({ data: { userId: user.id, bankCode: '058', accountNumber: '0001234567', accountName: 'TEST NAME', verifiedAt: new Date() } });
    const noop = async () => {};
    const walletService = new WalletService(prisma, { sendTransferReceipt: noop }, {}, config);
    await walletService.fundWallet(user.id, '1000', randomUUID());
    let submissions = 0;
    let status = 'pending';
    let lastInput;
    let timeout = false;
    let mismatch = {};
    const provider = {
      async createRecipient() { return 'RCP_test'; },
      async initiate(input) { submissions++; lastInput = input; if (timeout) throw new Error('timeout'); return { reference: input.reference, amountMinor: input.amountMinor.toString(), currency: 'NGN', domain: 'test', status: 'pending', transferCode: 'TRF_' + input.reference.replaceAll('-', '') }; },
      async verify(reference) {
        const p = await prisma.payout.findUniqueOrThrow({ where: { reference } });
        return { reference, amountMinor: p.amountMinor.toString(), currency: 'NGN', domain: 'test', status, transferCode: 'TRF_' + reference.replaceAll('-', ''), recipientCode: 'RCP_test', bankCode: p.bankCode, accountNumber: p.accountNumber, ...mismatch };
      },
    };
    const service = new PayoutsService(prisma, paystack, provider);
    const balances = async (balance, reserved) => {
      const wallet = await prisma.wallet.findUniqueOrThrow({ where: { id: user.wallet.id } });
      assert.equal(wallet.balanceMinor, BigInt(balance)); assert.equal(wallet.reservedMinor, BigInt(reserved));
      await prisma.$queryRaw`SELECT ledger_assert_wallet(${wallet.id})::text`;
    };
    const create = (amount, key) => service.create(user.id, beneficiary.id, amount, key);

    const race = await Promise.all(Array.from({ length: 5 }, () => create('100', 'same-request')));
    assert.equal(new Set(race.map(p => p.reference)).size, 1);
    assert.equal(submissions, 1);
    const reference = race[0].reference;
    await balances(100000, 10000);
    assert.equal((await service.get(user.id, reference)).status, 'PROCESSING');
    await assert.rejects(() => create('101', 'same-request'));
    await assert.rejects(() => service.get('other-user', reference));
    for (const change of [{ amountMinor: '1' }, { currency: 'USD' }, { domain: 'live' }, { recipientCode: 'RCP_other' }, { accountNumber: '9999999999' }, { bankCode: '044' }, { transferCode: 'TRF_other' }]) {
      mismatch = change;
      await assert.rejects(() => service.verify(reference));
      await balances(100000, 10000);
    }
    mismatch = {};
    status = 'unknown';
    assert.equal((await service.verify(reference)).uncertain, true);
    await balances(100000, 10000);
    status = 'success';
    await Promise.all(Array.from({ length: 5 }, () => service.verify(reference)));
    await balances(90000, 0);
    assert.equal((await service.get(user.id, reference)).status, 'SUCCESS');
    await service.verify(reference);
    await balances(90000, 0);

    // Signed reversal must recredit once; repeated delivery/verification cannot recredit again.
    status = 'reversed';
    const verified = await provider.verify(reference);
    const raw = Buffer.from(JSON.stringify({ event: 'transfer.reversed', data: { reference, amount: 10000, currency: 'NGN', domain: 'test', status, transfer_code: verified.transferCode } }));
    const sign = createHmac('sha512', 'sk_test_example123').update(raw).digest('hex');
    const webhook = new WebhookService(prisma, paystack, {}, service);
    await Promise.all(Array.from({ length: 5 }, () => webhook.receive(raw, sign)));
    const event = await prisma.paystackEvent.findFirstOrThrow({ where: { reference } });
    await Promise.all(Array.from({ length: 5 }, () => webhook.process(event.id)));
    await balances(100000, 0);
    assert.equal((await service.get(user.id, reference)).status, 'REVERSED');
    assert.equal(await prisma.transaction.count({ where: { reversalOfId: `withdrawal:${(await prisma.payout.findUniqueOrThrow({ where: { reference } })).reservationId}` } }), 1);
    await service.verify(reference);
    await balances(100000, 0);

    status = 'failed';
    const failure = await create('200', 'failed-request');
    assert.equal(failure.status, 'FAILED');
    await balances(100000, 0);
    status = 'success';
    await assert.rejects(() => service.verify(failure.reference));
    await balances(100000, 0);

    status = 'reversed';
    const reversedBeforeCapture = await create('50', 'early-reversal');
    assert.equal(reversedBeforeCapture.status, 'REVERSED');
    await balances(100000, 0);

    timeout = true; status = 'pending';
    const uncertain = await create('300', 'timeout-request');
    assert.equal(uncertain.uncertain, true);
    assert.equal(uncertain.status, 'PROCESSING');
    await balances(100000, 30000);
    const count = submissions;
    await create('300', 'timeout-request');
    assert.equal(submissions, count);
    assert.equal(lastInput.reference, uncertain.reference);
    provider.verify = async () => { throw new Error('provider 404 or timeout'); };
    await assert.rejects(() => service.verify(uncertain.reference));
    await balances(100000, 30000);
    await assert.rejects(() => create('701', 'overspend'));
    assert.equal(submissions, count);
    const uncertainRow = await prisma.payout.findUniqueOrThrow({ where: { reference: uncertain.reference } });
    await assert.rejects(() => prisma.withdrawalReservation.update({ where: { id: uncertainRow.reservationId }, data: { status: 'RELEASED' } }));
    await balances(100000, 30000);
    console.log('Payout database checks passed: atomic reservations, concurrent duplicate requests, success capture, definitive failure release, reversal credit once, signed duplicate reversal events, timeout retention, no resubmission, ownership, overspend prevention, and balance/ledger consistency.');
  } finally { await prisma.$disconnect(); }
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
