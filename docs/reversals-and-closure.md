# Reversals and permanent account closure

## Admin reversal

`POST /api/v1/wallet/transactions/:id/reverse` requires an authenticated, active ADMIN,
`x-idempotency-key`, and a body such as `{"reason":"Duplicate payment correction"}`.
The service also rechecks the administrator in the database while holding its lock.

This supports a full reversal of a posted internal transfer or simulated funding.
It creates a new SUCCESS transaction linked through `reversalOfId` and a new journal
whose entries use the original accounts and amounts with debit/credit sides exchanged.
The original transaction, journal and entries remain unchanged. Transaction history
shows both movements; the original still has status SUCCESS because it did happen.

The amount is taken from the original transaction, never supplied by the admin.
Partial reversals, reversal of a reversal, legacy transactions without a journal, and
withdrawal refunds are rejected. A withdrawal refund needs verified provider evidence
and a separate reconciliation flow; changing local accounting cannot retrieve money
from an external bank. This endpoint does not call a payment provider.

Available funds must cover the debit; reserved funds cannot be consumed. Credit limits
and closed-wallet restrictions still apply. Reversal, balance changes, journal,
audit reason/actor and retry response commit together. Sorted wallet locks and a
per-original transaction lock serialize competing corrections; a unique database
relation also permits only one full reversal. Same-key matching retries replay the
result. Another key for an already reversed transaction receives 409.

## Admin closure

`POST /api/v1/users/:id/close` requires an active ADMIN and a nonblank `reason` body.
Administrators cannot close their own account. Closure requires total and reserved
balances to be zero; settle funds and pending withdrawals first. A racing payment is
serialized with closure by the wallet lock. Repeating closure returns the closed state.

Closure sets `closedAt` on the user and wallet, deactivates the user, increments
`authVersion`, revokes refresh tokens and writes an ACCOUNT_CLOSED audit record.
Existing authentication checks therefore reject login, refresh and authenticated
requests. The ordinary activate/deactivate endpoint cannot reopen a closed account.
Deactivation remains a separate reversible action.

Rows are retained: users, wallets, transactions, ledger entries, reservation records,
and idempotency responses are not deleted. PostgreSQL blocks user/wallet deletion,
reopening closed records and ledger postings to closed wallets. The wallet-to-user
foreign key now uses RESTRICT rather than cascading deletion. Existing admin user
lookup and transaction records remain available for investigation.

There is no PII anonymization, retention schedule, or automatic reopening workflow in
this change. Closure preserves evidence; it does not claim to implement every data
retention requirement.

## Deployment

Back up the database, stop the old API, and apply the migration through Compose:

```sh
docker compose stop api
docker compose up -d --build api
```

The request-lock namespace was made explicit to separate client keys from internal
reversal locks; do not run old and new API versions together during this rollout.
Existing transactions and balances are unchanged by the migration.
