const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { ConfigService } = require('@nestjs/config');
const { PrismaService } = require('../../src/prisma/prisma.service');
const { BeneficiariesService } = require('../../src/beneficiaries/beneficiaries.service');

async function main() {
  const url = process.env.LEDGER_TEST_DATABASE_URL;
  if (!url || !new URL(url).pathname.startsWith('/wallet_ledger_test')) throw new Error('Use a migrated disposable LEDGER_TEST_DATABASE_URL named wallet_ledger_test*');
  const prisma = new PrismaService(new ConfigService({ DATABASE_URL: url }));
  await prisma.$connect();
  try {
    const users = await Promise.all([1,2].map(() => prisma.user.create({ data: { email: `beneficiary-${randomUUID()}@example.com`, password: 'test', wallet: { create: {} } }, include: { wallet: true } })));
    const input = { bankCode: '058', accountNumber: '0001234567' };
    const provider = { resolveBankAccount: async () => ({ ...input, accountName: 'VERIFIED TEST NAME' }) };
    const service = new BeneficiariesService(prisma, provider);
    const before = await prisma.ledgerJournal.count();
    const responses = await Promise.all(Array.from({ length: 5 }, () => service.create(users[0].id, input)));
    assert.equal(new Set(responses.map(row => row.id)).size, 1);
    assert.equal(await prisma.beneficiary.count({ where: { userId: users[0].id } }), 1);
    assert.equal(responses[0].accountNumberLast4, '4567');
    assert.equal(responses[0].accountNumber, undefined);
    await assert.rejects(() => service.get(users[1].id, responses[0].id));
    const other = await service.create(users[1].id, input);
    assert.notEqual(other.id, responses[0].id);
    assert.equal((await service.list(users[1].id)).data.length, 1);
    provider.resolveBankAccount = async () => { throw new Error('provider unavailable'); };
    await assert.rejects(() => service.create(users[0].id, { ...input, accountNumber: '9999999999' }));
    assert.equal(await prisma.beneficiary.count({ where: { userId: users[0].id } }), 1);
    assert.equal(await prisma.ledgerJournal.count(), before);
    assert.equal((await prisma.wallet.findUniqueOrThrow({ where: { id: users[0].wallet.id } })).balanceMinor, 0n);
    await assert.rejects(() => prisma.beneficiary.create({ data: { userId: users[0].id, bankCode: '058', accountNumber: '123', accountName: 'NAME', verifiedAt: new Date() } }));
    console.log('Beneficiary database checks passed: concurrent deduplication, ownership, masked reads, provider failures, account constraints, and unchanged ledger/balances.');
  } finally { await prisma.$disconnect(); }
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
