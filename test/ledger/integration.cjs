// Run only against a new, disposable database named wallet_ledger_test*.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { Client } = require('pg');
const { ConfigService } = require('@nestjs/config');
const { PrismaService } = require('../../src/prisma/prisma.service');
const { WalletService } = require('../../src/wallet/wallet.service');

async function main() {
  const url = process.env.LEDGER_TEST_DATABASE_URL;
  if (!url || !new URL(url).pathname.startsWith('/wallet_ledger_test')) {
    throw new Error('Provide a disposable LEDGER_TEST_DATABASE_URL named wallet_ledger_test*');
  }
  const client = new Client({ connectionString: url });
  await client.connect();
  let prisma;
  let checks = 0;
  const reject = async (sql, code = '23514') => {
    await client.query('BEGIN');
    try {
      await client.query(sql);
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      assert.equal(error.code, code);
      checks++;
      return;
    }
    throw new Error('Expected database rejection: ' + sql.slice(0, 60));
  };
  try {
    const tables = await client.query("SELECT count(*)::int AS n FROM pg_tables WHERE schemaname='public'");
    assert.equal(tables.rows[0].n, 0, 'Test database must be empty');
    const root = path.join(__dirname, '../../prisma/migrations');
    for (const name of fs.readdirSync(root).sort()) {
      const file = path.join(root, name, 'migration.sql');
      if (!fs.existsSync(file)) continue;
      if (name.endsWith('double_entry_ledger')) {
        await client.query(`
          INSERT INTO users(id,email,password,"updatedAt") VALUES
          ('alice','alice@example.com','test',now()), ('bob','bob@example.com','test',now()), ('legacy','legacy@example.com','test',now());
          INSERT INTO wallets(id,"userId",currency,"balanceMinor","updatedAt") VALUES
          ('alice-wallet','alice','NGN',10000,now()), ('bob-wallet','bob','NGN',0,now()), ('legacy-wallet','legacy','USD',2500,now());
        `);
      }
      await client.query(fs.readFileSync(file, 'utf8'));
    }
    const counts = await client.query('SELECT (SELECT count(*) FROM ledger_accounts)::int AS accounts, (SELECT count(*) FROM ledger_journals)::int AS journals');
    assert.deepEqual(counts.rows[0], { accounts: 11, journals: 2 }); checks++;
    assert.equal((await client.query("SELECT currency FROM ledger_journals WHERE id='opening:legacy-wallet'")).rows[0].currency, 'USD'); checks++;

    prisma = new PrismaService(new ConfigService({ DATABASE_URL: url }));
    await prisma.$connect();
    const noop = async () => {};
    const service = new WalletService(prisma,
      { sendTransferReceipt: noop, sendTransferReceivedEmail: noop },
      { notifyTransferReceived: noop },
      new ConfigService({ NODE_ENV: 'test', ENABLE_SIMULATED_FUNDING: 'true' }));
    const firstFunding = await service.fundWallet('bob', '10.50', 'fund-1');
    await service.transferFunds('alice', 'bob@example.com', '1.25', 'transfer-1');
    const balances = (await client.query("SELECT id, \"balanceMinor\" FROM wallets WHERE currency='NGN' ORDER BY id")).rows;
    assert.deepEqual(balances, [{ id: 'alice-wallet', balanceMinor: '9875' }, { id: 'bob-wallet', balanceMinor: '1175' }]); checks++;
    const unbalanced = await client.query(`SELECT "journalId" FROM ledger_entries GROUP BY "journalId" HAVING sum(CASE WHEN side='DEBIT' THEN "amountMinor"::numeric ELSE -"amountMinor"::numeric END) <> 0`);
    assert.equal(unbalanced.rowCount, 0); checks++;
    assert.deepEqual(await service.fundWallet('bob', '10.5', 'fund-1'), firstFunding); checks++;
    assert.equal((await client.query("SELECT count(*)::int AS n FROM ledger_journals WHERE reference='transaction:fund-1'")).rows[0].n, 1); checks++;

    // Two competing debits: exactly one can spend the available funds.
    const attempts = await Promise.allSettled([
      service.transferFunds('alice', 'bob@example.com', '70.00', 'race-1'),
      service.transferFunds('alice', 'bob@example.com', '70.00', 'race-2'),
    ]);
    assert.equal(attempts.filter(x => x.status === 'fulfilled').length, 1); checks++;
    await client.query('SELECT ledger_assert_wallet(id) FROM wallets'); checks++;

    await reject("UPDATE wallets SET \"balanceMinor\"=999 WHERE id='alice-wallet'");
    await reject("UPDATE wallets SET currency='USD' WHERE id='alice-wallet'");
    await reject("UPDATE ledger_entries SET \"amountMinor\"=1 WHERE id='opening:credit:alice-wallet'");
    await reject("DELETE FROM ledger_journals WHERE id='opening:alice-wallet'");
    await reject('TRUNCATE ledger_entries');
    await reject("UPDATE ledger_accounts SET currency='USD' WHERE id='wallet:alice-wallet'");
    await reject("INSERT INTO ledger_entries(id,\"journalId\",\"accountId\",side,\"amountMinor\") VALUES ('late','opening:alice-wallet','system:NGN:FEES','CREDIT',1)");
    await reject("INSERT INTO ledger_journals(id,reference,currency,description) VALUES ('empty','empty','NGN','Invalid empty journal')");
    await reject(`INSERT INTO ledger_journals(id,reference,currency,description) VALUES ('bad','bad','NGN','Unbalanced');
      INSERT INTO ledger_entries(id,"journalId","accountId",side,"amountMinor") VALUES ('bad1','bad','system:NGN:CLEARING','DEBIT',2),('bad2','bad','system:NGN:FEES','CREDIT',1)`);
    await reject(`INSERT INTO ledger_journals(id,reference,currency,description) VALUES ('fx','fx','NGN','Currency mismatch');
      INSERT INTO ledger_entries(id,"journalId","accountId",side,"amountMinor") VALUES ('fx1','fx','system:USD:CLEARING','DEBIT',1)`);
    await reject("UPDATE transactions SET \"amountMinor\"=1 WHERE \"referenceId\"='fund-1'");
    // Ledger posting exists, but wallet update is missing: the entire transaction rolls back.
    await reject(`INSERT INTO transactions(id,"amountMinor",currency,type,status,"referenceId","receiverWalletId",metadata,"updatedAt")
      VALUES ('orphan',100,'NGN','CREDIT','SUCCESS','orphan','bob-wallet','{"fundingSource":"SIMULATION"}',now())`);
    assert.equal((await client.query("SELECT count(*)::int AS n FROM ledger_journals WHERE reference='transaction:orphan'")).rows[0].n, 0); checks++;
    await reject("DELETE FROM wallets WHERE id='bob-wallet'");
    await reject(`INSERT INTO ledger_journals(id,reference,currency,description) VALUES ('latebad','latebad','NGN','Late imbalance');
      INSERT INTO ledger_entries(id,"journalId","accountId",side,"amountMinor") VALUES ('lb1','latebad','system:NGN:CLEARING','DEBIT',1),('lb2','latebad','system:NGN:FEES','CREDIT',1);
      SET CONSTRAINTS ALL IMMEDIATE; SET CONSTRAINTS ALL DEFERRED;
      INSERT INTO ledger_entries(id,"journalId","accountId",side,"amountMinor") VALUES ('lb3','latebad','system:NGN:FEES','CREDIT',1)`);
    await reject(`INSERT INTO ledger_journals(id,reference,currency,description) VALUES ('zero','zero','NGN','Zero amount');
      INSERT INTO ledger_entries(id,"journalId","accountId",side,"amountMinor") VALUES ('z1','zero','system:NGN:CLEARING','DEBIT',0)`);
    // New zero-balance wallets get their customer account automatically.
    await client.query(`BEGIN; INSERT INTO users(id,email,password,"updatedAt") VALUES ('new','new@example.com','test',now());
      INSERT INTO wallets(id,"userId","updatedAt") VALUES ('new-wallet','new',now()); COMMIT;`);
    assert.equal((await client.query("SELECT count(*)::int AS n FROM ledger_accounts WHERE \"walletId\"='new-wallet'")).rows[0].n, 1); checks++;

    // Reservations must preserve the total ledger balance until confirmed payout.
    const held = await service.reserveWithdrawal('bob', '30.00', 'payout-1');
    assert.equal(held.status, 'PENDING'); checks++;
    assert.equal((await prisma.wallet.findUniqueOrThrow({where:{id:'bob-wallet'}})).reservedMinor, 3000n); checks++;
    assert.deepEqual(await service.reserveWithdrawal('bob', '30.00', 'payout-1'), held); checks++;
    await assert.rejects(() => service.reserveWithdrawal('bob', '30.01', 'payout-1')); checks++;
    await assert.rejects(() => service.reserveWithdrawal('alice', '30.00', 'payout-1')); checks++;
    await assert.rejects(() => service.transferFunds('bob','alice@example.com','51.76','held-spend')); checks++;
    const captured = await service.resolveWithdrawal('payout-1', 'CAPTURED');
    assert.deepEqual(await service.resolveWithdrawal('payout-1','CAPTURED'), captured); checks++;
    await assert.rejects(() => service.resolveWithdrawal('payout-1','RELEASED')); checks++;
    const bob = await prisma.wallet.findUniqueOrThrow({where:{id:'bob-wallet'}});
    assert.equal(bob.balanceMinor, 5175n); assert.equal(bob.reservedMinor, 0n); checks++;
    assert.equal((await client.query(`SELECT count(*)::int n FROM transactions WHERE type='DEBIT'`)).rows[0].n,1); checks++;
    await service.reserveWithdrawal('alice','20.00','release-1');
    const released = await service.resolveWithdrawal('release-1','RELEASED');
    assert.deepEqual(await service.resolveWithdrawal('release-1','RELEASED'),released); checks++;
    await assert.rejects(() => service.resolveWithdrawal('release-1','CAPTURED')); checks++;
    const alice = await prisma.wallet.findUniqueOrThrow({where:{id:'alice-wallet'}});
    assert.equal(alice.balanceMinor,2875n); assert.equal(alice.reservedMinor,0n); checks++;
    const race = await Promise.allSettled([
      service.reserveWithdrawal('alice','20.00','reserve-race'),
      service.transferFunds('alice','bob@example.com','20.00','transfer-reserve-race'),
    ]);
    assert.equal(race.filter(x=>x.status==='fulfilled').length,1); checks++;
    await reject(`UPDATE wallets SET "reservedMinor"=1 WHERE id='bob-wallet'`);
    await reject(`UPDATE wallets SET "reservedMinor"=-1 WHERE id='bob-wallet'`);
    await reject(`UPDATE wallets SET "reservedMinor"="balanceMinor"+1 WHERE id='bob-wallet'`);
    await reject(`UPDATE withdrawal_reservations SET status='PENDING' WHERE reference='payout-1'`);
    await reject(`DELETE FROM withdrawal_reservations WHERE reference='payout-1'`);
    await reject('TRUNCATE withdrawal_reservations');
    await reject(`INSERT INTO withdrawal_reservations(id,reference,"walletId",currency,"amountMinor","updatedAt") VALUES ('usd','usd','legacy-wallet','NGN',1,now())`);
    await reject(`INSERT INTO withdrawal_reservations(id,reference,"walletId",currency,"amountMinor","updatedAt") VALUES ('large','large','bob-wallet','NGN',99999999,now())`);
    await client.query('SELECT ledger_assert_wallet(id) FROM wallets'); checks++;

    // Same key, simultaneous requests: one posting and the exact original response.
    const beforeRetry = await prisma.wallet.findUniqueOrThrow({where:{id:'bob-wallet'}});
    const concurrentFunding = await Promise.all([
      service.fundWallet('bob','1.00','retry-fund'),
      service.fundWallet('bob','1','retry-fund'),
    ]);
    assert.deepEqual(concurrentFunding[0],concurrentFunding[1]); checks++;
    assert.equal((await prisma.wallet.findUniqueOrThrow({where:{id:'bob-wallet'}})).balanceMinor,beforeRetry.balanceMinor+100n); checks++;
    await assert.rejects(()=>service.fundWallet('bob','2','retry-fund'), /different request/); checks++;
    await assert.rejects(()=>service.fundWallet('alice','1','retry-fund'), /different request/); checks++;
    await assert.rejects(()=>service.transferFunds('bob','alice@example.com','1','retry-fund'), /different request/); checks++;
    const transfers = await Promise.all([
      service.transferFunds('bob','alice@example.com','1','retry-transfer'),
      service.transferFunds('bob','alice@example.com','1.00','retry-transfer'),
    ]);
    assert.deepEqual(transfers[0], transfers[1]); checks++;
    await assert.rejects(()=>service.transferFunds('bob','new@example.com','1','retry-transfer'), /different request/); checks++;
    assert.equal((await client.query(`SELECT count(*)::int n FROM transactions WHERE "referenceId"='retry-transfer'`)).rows[0].n,1); checks++;
    // A failed operation leaves no saved success or financial record, so retry can succeed.
    await assert.rejects(()=>service.transferFunds('new','alice@example.com','1','failed-retry')); checks++;
    assert.equal(await prisma.walletRequest.count({where:{key:'failed-retry'}}),0); checks++;
    await service.fundWallet('new','2','new-fund');
    await service.transferFunds('new','alice@example.com','1','failed-retry'); checks++;
    await assert.rejects(()=>service.fundWallet('bob','1',' bad key ')); checks++;
    await reject("UPDATE wallet_requests SET fingerprint='changed' WHERE key='retry-fund'");
    await reject("DELETE FROM wallet_requests WHERE key='retry-fund'");
    // Opposite directions still take wallet locks in the same order.
    await Promise.all([
      service.transferFunds('bob','new@example.com','0.01','opposite-a'),
      service.transferFunds('new','bob@example.com','0.01','opposite-b'),
    ]); checks++;
    await client.query('SELECT ledger_assert_wallet(id) FROM wallets'); checks++;
    console.log(`Ledger database integration: ${checks} checks passed (migration, posting, retries, concurrency, immutability, rollback).`);
  } finally {
    if (prisma) await prisma.$disconnect();
    await client.end();
  }
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
