# Financial events, fees, and reconciliation

Sensitive write routes now require verified email and an action-bound `x-step-up-token`. Complete the [account security flow](account-security.md) before following write examples below.

Apply the new migration and restart the API:

```bash
npx prisma generate
npx prisma migrate deploy
npm run start:dev
```

The integration remains test-only. The implemented policy is **business-paid Paystack fees**; customer funding and payout principal amounts remain as requested. Verified disputes and recovery shortfalls freeze outgoing money for investigation. Incoming funding is still allowed. This is not an automatic customer-debt collection or write-off policy.

## Payout references and uncertain outcomes

The payout reference and submission marker remain fixed. Matching retries return the existing payout; verification never submits another transfer. A timeout, missing provider record, contradictory terminal status, or destination mismatch retains the reservation and is surfaced as an investigation issue. Reconciliation does not treat a 404 or elapsed timeout as permission to release funds or send another payout. Operator review with provider evidence is required when verification cannot establish the outcome.

## Refunds, disputes, and chargebacks

The same signed `/api/v1/paystack/webhook` inbox now accepts `refund.*` and `charge.dispute.*` events alongside funding and payout events. Stored notices retain the case identifier and transaction reference, not card authorizations or dispute evidence. Before money changes, the app fetches the refund/dispute from Paystack and independently fetches its transaction. Currency, test mode, original amount, transaction ID, customer, and local credited funding must match.

Pending/processing/failed refunds do not debit the wallet. A processed refund recovers its principal from available wallet money. Outstanding payout reservations are preserved. If a refund exceeds available money, the app recovers only what is available, posts the remainder to the adjustments account, records `shortfallMinor`, and freezes outgoing money. Balances never become negative. These changes, the case record, and ledger postings commit atomically.

A resolved, `merchant-accepted` dispute with a verified positive `refund_amount` is treated as a chargeback settlement. A processed refund linked to that dispute uses the same accounting case, preventing a second debit. Partial or changed settlements with inconsistent amounts, unlinked overlapping refunds, unfamiliar resolution values, or reversals of an already applied recovery are flagged for investigation rather than guessed. Cumulative recoveries cannot exceed the original funding amount.

Unresolved disputes freeze new outgoing transfers/reservations and unsent payouts. A payout already submitted may still be captured on verified success because those funds were previously reserved. Resolved/declined disputes do not debit money, but unfreezing requires a recorded administrator review. This implementation consumes provider-side refund/dispute outcomes; it does not initiate refunds, accept disputes, or submit evidence to Paystack automatically. Use Paystack's merchant process for those actions.

Financial cases are deduplicated by provider identity. Duplicate webhook bodies share an inbox row; differently formatted repeats cannot repeat a ledger recovery. Previously applied cases remain immutable. A separate test database suite forces partial refunds, spent funds, duplicate events, chargebacks, and linked-refund overlap.

## Fees

Verified `fees` on funding records and `fee_charged` on transfer records are booked during reconciliation: debit the business fees account, credit Paystack clearing. The fee is not deducted from the customer's wallet. Identical observations post once, including zero-fee records. Missing fees, malformed values, and changed fee totals are recorded for review; historical fee journals are not rewritten or silently adjusted. Provider fee refunds and unusual dispute fees require reviewed adjustments when they change previously observed totals.

## Scheduled reconciliation

A worker runs every 15 minutes while Paystack is enabled and the API is running. It refreshes unapplied financial cases and performs a full reconciliation, with a persistent lease to coordinate replicas. Crashed leases expire after one hour. Runs are retained with `CLEAN`, `DIFFERENCES`, or `INCOMPLETE` status; provider outages and incomplete pagination never produce a clean result.

Checks include:

- Wallet balances against net customer ledger entries; reserved balances against pending reservations.
- Balanced journals and local successful-funding postings.
- Payout states against reservations and independently verified provider destinations/statuses.
- Both directions of provider inventory matching, including provider-only transactions and transfers.
- Refund/dispute records missed by webhook delivery.
- Provider NGN balance against ledger clearing after observed fees and recoveries.

Provider inventories are paginated, with a 100-page safety bound. Exceeding the bound marks the run incomplete. Balance comparisons can legitimately differ because of settlement timing, pending transfers, opening balances, external merchant activity, or missing accounting entries. Such differences remain investigation items; the app never edits customer balances merely to force equality. SQL wallet/journal comparisons use a repeatable-read snapshot. Provider comparisons span API reads and can detect temporary timing differences that an operator should recheck.

## Test and investigate in Swagger

Use an **administrator** account for `/api/v1/admin/financial-operations` endpoints. Ordinary users receive 403. Registration does not grant administrator privileges.

1. `POST /reconcile`: run the checks now. No body is required. This may take time because it fetches and verifies provider records.
2. `GET /runs`: read the latest 100 run results and counts.
3. `GET /issues`: read the latest 100 unresolved discrepancies. Keys deduplicate repeated findings.
4. `GET /cases` and `GET /fees`: inspect verified refund/dispute cases, recovery shortfalls, and booked provider fees. Monetary amounts are strings in minor units.
5. `POST /issues/{id}/resolve`: after investigation, provide a meaningful `reason` with the external evidence reference. This records an audited resolution; it does not change money. A materially changed finding reopens the issue, while identical reviewed findings retain their resolution.
6. `POST /wallets/{id}/unfreeze`: provide a meaningful `reason` after resolving active disputes and related investigation issues. This is audited, changes only the outgoing freeze, and cannot reopen a closed wallet. It does not collect or erase the recorded shortfall.

For real provider integration testing, use the test dashboard's supported refund/dispute tools and watch the signed webhook plus case records. Do not fabricate a production chargeback or manually change balances. If your business/test environment does not expose these events, use the automated scenarios:

```bash
npm test -- --runInBand --watchman=false
# Only with LEDGER_TEST_DATABASE_URL pointing to a migrated disposable wallet_ledger_test* database:
npm run test:operations
```

The database tests use mocked Paystack responses, including forced discrepancy detection. They do not validate live merchant permissions or every possible provider dispute lifecycle. Review investigation policies, asset opening balances, fee adjustments, and production infrastructure before enabling live money.

References: [Paystack refunds](https://paystack.com/docs/api/refund/), [disputes](https://paystack.com/docs/api/dispute/), and [webhook events](https://paystack.com/docs/payments/webhooks/).
