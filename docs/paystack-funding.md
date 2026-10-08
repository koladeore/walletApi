# Paystack test funding

Enable the test integration as described in [configuration.md](configuration.md). Apply the database migration before starting this version of the API:

```bash
npx prisma generate
npx prisma migrate deploy
```

For Compose, `docker compose up -d --build api` runs the migration service before starting the API.

## Initialize checkout

Authenticated users call `POST /api/v1/wallet/funding/initialize` with their bearer token, an `x-idempotency-key` header, and this JSON body:

```json
{ "amount": "100.50" }
```

The amount is a positive NGN decimal string. Currency, customer email, wallet, provider mode, and payment reference are determined on the server; additional body fields are rejected. The API snapshots the authenticated user's email and stores 10050 kobo before calling Paystack. It rejects inactive users, closed wallets, other currencies, and amounts beyond JavaScript's safe integer range in minor units.

A successful response (HTTP 201) has this shape:

```json
{
  "reference": "fund-server-generated-uuid",
  "amount": "100.50",
  "amountMinor": "10050",
  "currency": "NGN",
  "status": "PENDING",
  "authorizationUrl": "https://checkout.paystack.com/provider-code",
  "accessCode": "provider-code"
}
```

Open `authorizationUrl` for checkout. Initialization creates no wallet transaction or ledger entries and does not increase the wallet balance. A successful payment is credited only after server-side verification matches the stored reference, customer email, exact amount, currency, and test mode.

## Retries and uncertain responses

Reuse the same idempotency key and amount for retries. A completed initialization returns the stored checkout without calling Paystack again. A different amount with the same key returns HTTP 409. Keys are scoped to the authenticated user and are distinct from the generated provider reference.

Concurrent retries are serialized in PostgreSQL. While initialization is in flight, retries return HTTP 409 with the existing reference. Provider failures and timeouts are conservatively recorded as `INITIALIZATION_UNKNOWN`, because a failed response does not prove checkout was not created. Do not create a new key blindly after such an error; verify the existing reference first. A process crash can leave a request `INITIALIZING`; the background checker includes these requests.

`GET /api/v1/wallet/funding/:reference` returns the stored request only for its owner. It does not query Paystack or verify payment. Unknown references and another user's references both return HTTP 404.

## Confirm an existing payment in Swagger

After applying the migration and restarting the API, authorize Swagger as the user who owns the request. Call `POST /api/v1/wallet/funding/{reference}/verify`, using the reference returned at initialization. No request body or idempotency header is needed. This calls Paystack's verification API and credits a matching successful test payment once. Repeating it returns `SUCCESS` without adding money again. A pending provider payment stays pending; failed/abandoned/reversed provider statuses are stored as `FAILED`. A mismatch returns HTTP 409 without crediting. Unknown references and references belonging to another user return HTTP 404.

The funding response still contains the original amount. Check `GET /api/v1/users/wallet` for the resulting wallet balance and `GET /api/v1/wallet/transactions` for the credit.

## Configure webhooks

In Paystack's **test** API settings, set the webhook URL to:

```text
https://YOUR_PUBLIC_HOST/api/v1/paystack/webhook
```

For native local development, use a public HTTPS development tunnel forwarding to port 3000. Paystack cannot reach `localhost` on your computer. A tunnel exposes your running API publicly; use it with your test environment and keep the normal endpoint authentication enabled. Keep the tunnel and API running while testing.

Set the test callback URL to your application's informational route:

```text
http://localhost:3000/api/v1/paystack/callback
```

The callback is a browser redirect, so localhost works for a browser on your own computer. It does not verify or credit payments. Use your deployed HTTPS host for remote users. Replace the old `/paystack/callback` dashboard setting, which lacked the API prefix.

The webhook requires `x-paystack-signature`, authenticated with HMAC-SHA512 over the exact raw body and the configured test secret. It stores a SHA256-keyed event before returning HTTP 200. Repeated identical events reuse the inbox row; events with different formatting still cannot double-credit because funding requests, provider transaction IDs, financial transaction IDs, and references enforce credit uniqueness. Invalid signatures return HTTP 401 before persistence. Card authorization tokens are excluded from stored events.

The persistent inbox is processed every 30 seconds while Paystack is enabled. Workers claim events with a 60-second lease, allowing crash recovery. Verification outages are retried with increasing delays up to one hour. Unknown requests, payment mismatches, and unavailable/closed wallets are marked `REJECTED` for review; they do not add money. Unrelated signed event types are persisted as `IGNORED`.

## Delayed payments and ledger posting

The background worker also checks up to 10 pending/uncertain requests per cycle once they are at least a minute old. Check times are stored to spread work across requests and replicas. Failed verification remains available for a later retry; `FAILED` requests can still be reverified manually or confirmed by a later valid success webhook. Manual verification is useful when a webhook wasn't configured when you paid.

Confirmation locks the funding request and wallet. One PostgreSQL transaction records `SUCCESS`, the verified provider transaction ID, the financial credit, balanced ledger entries, and the wallet increment. The ledger debits `system:NGN:CLEARING` and credits the customer's liability account. Database constraints prevent success without its ledger posting, preserve expected funding details, and prevent rewriting a completed confirmation. A failed write rolls back all money changes. Test payments are accounted for as test provider clearing; this integration rejects live keys and live payment responses.

Customer matching uses the email snapshot captured at initialization, case-insensitively. Amounts and numeric provider IDs must be exact safe integers; larger provider IDs are accepted only as decimal strings, otherwise verification fails closed. Closed wallets and balance-limit failures require reconciliation. Paystack credits cannot be reversed through the internal transfer reversal endpoint; a provider refund workflow is required separately.

References: [Paystack transaction initialization and verification](https://paystack.com/docs/api/transaction/) and [webhook signatures and delivery](https://paystack.com/docs/payments/webhooks/).

## Database integration checks

`npm run test:funding` requires `LEDGER_TEST_DATABASE_URL` pointing to a migrated disposable database whose name starts with `wallet_ledger_test`. It uses mocked provider responses to test concurrent initialization and confirmation, signed duplicate events, rejected mismatches, atomic rollback, and balanced ledger posting against PostgreSQL. Never use the application database for this test. `npm run test:ledger` can first apply all migrations and check the internal money foundation against an empty disposable database.
