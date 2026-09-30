# Available and reserved wallet balances

`balanceMinor` remains the total customer liability reconciled to the immutable ledger.
`reservedMinor` is the portion held for pending withdrawals. Available money is derived
as `balanceMinor - reservedMinor`; it is not another independently mutable balance.
All calculations use integer minor units. New reservations require NGN.

Wallet responses now include `balance`, `reservedBalance`, and `availableBalance` as
formatted currency strings, plus `balanceMinor`, `reservedMinor`, and `availableMinor`
as integer strings. For example, a ₦10,000 wallet with a ₦3,000 pending withdrawal
returns total `10000.00`, reserved `3000.00`, and available `7000.00`.
Transfers check the available amount after locking the wallets.

## Internal lifecycle

- `WalletService.reserveWithdrawal(userId, amount, reference)` reserves funds. Amount
  is a naira string. The same reference and parameters return the existing reservation;
  changing its wallet or amount is rejected. Reusing a resolved reference does not
  create a new withdrawal.
- `resolveWithdrawal(reference, 'RELEASED')` releases the hold without changing total
  balance. Only use after a definitive failure or confirmed cancellation.
- `resolveWithdrawal(reference, 'CAPTURED')` consumes the hold, reduces total balance,
  creates a successful DEBIT transaction, and posts customer debit / clearing credit.
  Only use after verifying provider success, including reference, amount and currency.
- Repeating the same outcome is safe; conflicting outcomes are rejected. A timeout
  or unknown provider outcome must stay PENDING until reconciliation resolves it.

These are internal service methods, not public HTTP endpoints. No payout provider,
external bank transfer, webhook verification, automatic expiry, or fee calculation is
implemented here. A future payout integration must reserve the total debit including
any fees and define the corresponding fee ledger postings. Capture here models the
withdrawal principal only. Do not call it merely because a provider accepted a request.

PostgreSQL triggers enforce positive amounts, currency matching, legal transitions,
immutable reservation identity, and non-deletable reservation records. They update
reserved totals atomically and require the total reserved to equal pending reservations
at commit. Database constraints require `0 <= reservedMinor <= balanceMinor`.
Wallet locks serialize competing transfers, reservations and settlement attempts.
Reserving/releasing does not move money in the ledger; capture does, atomically.

## Apply and verify

Back up the database before deploying the migration. Stop the old API while applying
schema changes, then rebuild with the existing Compose migration service:

```sh
docker compose stop api
docker compose up -d --build api
```

Existing wallets start with zero reserved funds. Existing total balances are unchanged.
If an external system already has pending withdrawals, reconcile and import those holds
before accepting new spending; this migration cannot discover them.

`npm run test:ledger` uses an empty disposable database selected by
`LEDGER_TEST_DATABASE_URL` (database name must begin `wallet_ledger_test`). It exercises
real PostgreSQL migrations, concurrent spending, retries, capture/release and rejected
constraint violations. Never point it at the application database.
