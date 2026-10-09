# Paystack test payouts

Sensitive write routes now require verified email and an action-bound `x-step-up-token`. Complete the [account security flow](account-security.md) before following write examples below.

Apply the migration and restart the API:

```bash
npx prisma generate
npx prisma migrate deploy
npm run start:dev
```

Use the existing Paystack test secret and enable the integration. All customer payout routes require an active user's bearer token. This feature accepts only NGN test payouts and does not enable real-money withdrawals.

## Test in Swagger

1. Save a verified beneficiary using the [beneficiary endpoints](beneficiaries.md). Copy its `id`.
2. Check `GET /api/v1/users/wallet`. You need enough `availableBalance` for the requested amount.
3. Call `POST /api/v1/wallet/payouts` with `x-idempotency-key: payout-test-001` and:

   ```json
   { "beneficiaryId": "YOUR_BENEFICIARY_UUID", "amount": "100.00" }
   ```

4. Copy the server-generated `payout-...` reference. Read the result with `GET /api/v1/wallet/payouts/{reference}`. `GET /api/v1/wallet/payouts` lists your latest 100 records.
5. The amount is reserved before Paystack is contacted. While pending or processing, total balance stays the same, reserved balance increases, and available balance decreases. Paystack may complete a test transfer immediately, so you may see the final balance before observing its reserved state.
6. Once verified successful, `status` is `SUCCESS`: reserved balance decreases and total balance is debited once. Paystack test transfers do not send real money to the beneficiary's bank.
7. Repeat the POST with the same key and body. It returns the same reference without reserving funds or submitting a completed/uncertain transfer again. A changed amount or beneficiary with the same key returns 409.
8. `POST /api/v1/wallet/payouts/{reference}/verify` requests an immediate provider check. It never submits or retries a transfer. No body or idempotency header is needed.

Paystack may require merchant transfer authorization (provider status `otp`). Such payouts remain `PROCESSING`, with funds reserved and an explanatory message. This step does not expose a customer OTP-finalization endpoint or disable Paystack's authorization controls. Follow your Paystack merchant's transfer-approval process.

## Outcomes and uncertain requests

| Status | Money behavior |
| --- | --- |
| PENDING | Reservation committed; recipient preparation has not completed |
| PROCESSING | Submission started or Paystack outcome pending; funds remain reserved |
| SUCCESS | Verified matching success captures the reservation and posts the debit once |
| FAILED | Verified matching failure releases the reservation; no debit |
| REVERSED | Before capture: release the reservation. After capture: a separate reversing ledger credit restores the amount once |

Each payout snapshots the beneficiary's bank/account details and uses a fixed server reference. Creating a provider recipient is retried safely before payout submission. A submission marker is committed before contacting Paystack: after that marker, automatic and customer retries only verify the existing reference. A crash between the marker and the network request is conservatively uncertain.

Timeouts, authorization errors, malformed responses, destination mismatches, and provider 404/not-found responses are **not definitive transfer failures**. Funds remain reserved, `uncertain` is set, and an explanation is returned. An API error does not establish that Paystack did not process the transfer. Do not create a new key to work around an uncertain payout. Resolve the existing reference with Paystack and your operator before releasing money or requesting another payout. This implementation does not automatically resubmit transfers after an uncertain outcome.

A verified failure is terminal locally. If Paystack later reports a contradictory success for funds already released, no automatic debit or retry occurs: the payout is flagged for reconciliation. Likewise, a reversal into a closed wallet or beyond its balance limit requires investigation.

## Webhooks and background checks

Use the same public `/api/v1/paystack/webhook` endpoint already configured for funding. Signed `transfer.success`, `transfer.failed`, and `transfer.reversed` events are stored and processed by the durable inbox. The worker verifies the transfer through Paystack before changing balances. Event payload claims alone never capture or release funds.

A worker runs every 30 seconds. Pending/processing payouts are checked at roughly one-minute intervals, successful payouts at hourly intervals to catch missed reversals. Requests waiting for recipient creation use a persistent lease; submitted requests are never dispatched again. Replicas coordinate check times in the database. Stored records survive restarts, but the workers run only while the API is running.

Database constraints tie payout statuses to reservations. Capture uses the existing reservation-triggered withdrawal journal. Reversal appends a new transaction and inverse journal, preserving the original debit. Concurrent duplicate requests, verifications, and reversal events cannot reserve, debit, or restore the same amount twice.

## Scope and verification

This step covers reservations, recipient creation, payout submission, outcome checks, payout events, and reversals. [Financial operations](financial-operations.md) adds refunds/disputes/chargebacks, business-borne fee accounting, and provider-versus-ledger reconciliation. The customer's reservation covers payout principal only; customer-paid fees are not enabled. Keep test-mode accounting separate from live money before enabling production.

`npm run test:payouts` runs PostgreSQL balance-safety tests against a migrated disposable `LEDGER_TEST_DATABASE_URL` database named `wallet_ledger_test*`. Provider responses are mocked to force success, failure, reversal, mismatches, and timeouts. Never run database integration tests against the application database.

References: [Paystack transfers](https://paystack.com/docs/api/transfer/) and [transfer recipients](https://paystack.com/docs/api/transfer-recipient/).
