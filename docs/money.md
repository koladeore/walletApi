# NGN amounts and integer minor units

New wallets use NGN. One naira is 100 kobo. Wallet balances and transaction amounts are PostgreSQL BIGINT fields (`balanceMinor` / `amountMinor`) and JavaScript bigint values internally. No Number conversion is used for balance decisions.

## API contract (breaking input change)

Funding and transfer requests accept a decimal **string in naira**:

```json
{ "amount": "100.50" }
```

A transfer also requires `receiverEmail`. Keep the existing idempotency header. Numeric JSON amounts, scientific notation, commas, negative/zero amounts, and more than two decimal places are rejected. Amounts are never rounded silently.

Responses contain exact strings:

```json
{ "currency": "NGN", "balanceMinor": "10050", "balance": "100.50" }
```

Transactions similarly return `amountMinor` and `amount`. All other response fields remain available. History and wallet endpoints serialize bigint values explicitly. Clients should retain these as strings or use exact decimal/bigint arithmetic; do not convert large amounts to Number.

Maximum supported minor units: 9223372036854775807 (PostgreSQL BIGINT). Transfers and funding reject a resulting balance above this limit. Database constraints prohibit negative balances and nonpositive transaction amounts. Existing ordered row locks and atomic transfers remain in place.

## Existing data and deployment

The original project used USD by default. The migration multiplies existing amounts by 100 using PostgreSQL exact numeric arithmetic and preserves currency labels. USD becomes integer cents, not kobo, and is never converted or relabelled as NGN. Transaction currency is derived from its linked wallets; ambiguous/mismatched currencies or amounts outside the supported range stop the migration.

New money operations require NGN wallets. Old USD wallets and history remain readable. Use newly registered test accounts for NGN testing. Converting or resetting old test wallets requires a separate explicit data decision; this change does neither.

Back up the database before migration. Stop the old API/workers before applying this breaking schema change. For the local Compose setup:

```bash
docker compose stop api
docker compose up -d --build api
```

Compose runs the migration before starting the new API. Do not run an old image against the new schema. No application database has been migrated automatically as part of this implementation.

New transfer email/notification jobs carry NGN amounts as exact naira strings and a currency marker. Old pending transfer jobs without a marker fail for manual review instead of being relabelled as NGN; review/drain legacy jobs before deployment. They are not deleted automatically.

Simulated funding remains blocked in production. This milestone changes precision and units only; double-entry accounting, provider payments, fees/rounding rules, and a complete concurrency/load test suite are separate work.
