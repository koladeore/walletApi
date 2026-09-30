# Double-entry ledger

## What is stored

- `ledger_accounts`: one customer liability account per wallet, plus clearing, simulation clearing, fee revenue, and adjustment accounts per currency.
- `ledger_journals`: a permanent posting header with a unique reference, currency, description, timestamp, and optional unique transaction link.
- `ledger_entries`: positive integer minor-unit debits or credits against accounts. Account and journal currencies must match.

NGN system accounts exist even before any users register. Existing wallet currencies also get system accounts. Creating a zero-balance wallet automatically creates its customer account.

## Posting examples

Customer accounts represent money owed to customers: a credit increases their balance; a debit decreases it.

| Operation | Debit | Credit |
| --- | --- | --- |
| Simulated funding of NGN 100 | Simulation clearing: 10,000 kobo | Customer: 10,000 kobo |
| Alice sends Bob NGN 25 | Alice customer account: 2,500 kobo | Bob customer account: 2,500 kobo |
| Existing balance at migration | Opening adjustment account | Customer account |

Actual clearing and fee accounts are prepared but are not used to invent provider payments or fee charges. Real provider funding, withdrawals, fee schedules, and public adjustment/reversal workflows remain future work.

## Database guarantees

PostgreSQL triggers post journals when current supported transactions become successful. Posting runs inside the same database transaction as the existing balance updates; no background job is responsible for creating the financial record.

At commit, the database requires at least two entries per journal, equal total debits and credits, matching currencies, positive amounts, and wallet balances equal to customer ledger balances. Failed posting or reconciliation rolls the whole transaction back. Existing transaction-reference uniqueness and unique journal transaction links prevent duplicate successful postings.

Updates, deletes, truncation, and late insertion into committed journals are rejected. Successful transaction records and wallet identity/currency are protected as well. Corrections must use a new compensating journal, never overwrite a posted entry. A linked reversal API is not implemented yet.

Ledger-account foreign keys prevent deleting wallets with retained ledger accounts, including through user deletion. Use account deactivation instead of deleting financial history.

These rules apply to ordinary database writes. Database owners/superusers can deliberately bypass database protections; production must use a restricted application role and a separate migration role. The local Compose PostgreSQL superuser is for development.

## Existing balances and rollout

The migration takes exclusive locks on wallets and transactions. Existing balances get explicitly labelled opening journals against adjustments. Historical transactions remain historical records; they are not replayed or claimed to be independently verified payments. Opening balances do not prove external money backing and should be reconciled before any real-money launch.

Back up the database and stop all API/worker instances before applying. For the local project:

```bash
docker compose stop api
docker compose up -d --build api
```

The migration seeds accounts and opening balances, checks them, then enables posting and immutability. All migration changes run in a transaction. Do not run an older application version against the new schema: unsupported successful funding sources are rejected.

This change has not been applied to the user's application database automatically.

## Verification

`npm test` covers the application tests. `npm run test:ledger` runs real PostgreSQL integration tests using `LEDGER_TEST_DATABASE_URL`. It requires an empty disposable database whose name starts with `wallet_ledger_test`, and applies all migrations. Never point it at an application database.

The integration checks cover opening balances, legacy currency preservation, funding, transfers, duplicate references, concurrent spending, unbalanced/empty journals, currency mismatches, late appends, immutable entries/accounts/transactions, missing balance updates, deletion protection, and atomic rollback.

The current reconciliation check sums indexed ledger entries for each affected wallet. It favors correctness; measure this cost as history grows before high-volume rollout. An incremental projection with equivalent database protections can be introduced later.
