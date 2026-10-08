# Paystack funding initialization

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

Open `authorizationUrl` for checkout. This endpoint creates no wallet transaction or ledger entries and does not increase the wallet balance. Paying on checkout will remain uncredited until the webhook and verified-confirmation steps are implemented.

## Retries and uncertain responses

Reuse the same idempotency key and amount for retries. A completed initialization returns the stored checkout without calling Paystack again. A different amount with the same key returns HTTP 409. Keys are scoped to the authenticated user and are distinct from the generated provider reference.

Concurrent retries are serialized in PostgreSQL. While initialization is in flight, retries return HTTP 409 with the existing reference. Provider failures and timeouts are conservatively recorded as `INITIALIZATION_UNKNOWN`, because a failed response does not prove checkout was not created. Do not create a new key blindly after such an error; reconcile the existing reference with Paystack first. A process crash can leave a request `INITIALIZING`; automated reconciliation is a later milestone step.

`GET /api/v1/wallet/funding/:reference` returns the stored request only for its owner. It does not query Paystack or verify payment. Unknown references and another user's references both return HTTP 404.

References: [Paystack transaction initialization](https://paystack.com/docs/api/transaction/#initialize).

## Database integration checks

`npm run test:funding` requires `LEDGER_TEST_DATABASE_URL` pointing to a migrated disposable database whose name starts with `wallet_ledger_test`. It uses a mocked provider, tests concurrent retries against PostgreSQL, and checks that initialization leaves the wallet and ledger unchanged. Never use the application database for this test. `npm run test:ledger` can first apply all migrations and check the internal money foundation against an empty disposable database.
