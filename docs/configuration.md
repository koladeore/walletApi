# Required configuration

The API validates configuration at startup, before serving requests. Errors name invalid settings but never echo secrets or connection URLs.

| Setting | Requirement |
| --- | --- |
| NODE_ENV | Explicitly `development`, `test`, or `production` |
| DATABASE_URL | PostgreSQL URL with a hostname and database name |
| JWT_SECRET / REFRESH_SECRET | Required, different values; production rejects short, repetitive, and known placeholder secrets |
| JWT_EXPIRES_IN / REFRESH_EXPIRES_IN | Positive durations with `s`, `m`, `h`, or `d`; defaults `15m` / `7d`; maximum `365d` |
| PORT / REDIS_PORT | Integer 1-65535; defaults 3000 / 6379 |
| REDIS_HOST | Required in production; defaults to localhost in development/test |
| ENABLE_SIMULATED_FUNDING | `true` or `false`; default false; true is rejected in production |
| RESEND_API_KEY | Optional for local mock delivery; if supplied, must begin with `re_` |
| AUTH_DELIVERY_MODE | `disabled` (default), `test`, or `provider`; test is rejected in production |
| AUTH_SECURITY_SECRET | Distinct strong secret required in production; development/test falls back to JWT_SECRET if blank |
| AUTH_EMAIL_FROM | Bare sender email; required with RESEND_API_KEY for provider authentication delivery |
| LIMIT_BASIC_TRANSACTION_NGN / LIMIT_BASIC_DAILY_NGN | Positive NGN decimal strings; defaults 50000 / 100000 |
| LIMIT_VERIFIED_TRANSACTION_NGN / LIMIT_VERIFIED_DAILY_NGN | Positive NGN decimal strings; defaults 100000 / 500000; transaction must not exceed daily |
| PAYSTACK_ENABLED | `true` or `false`; default false |
| PAYSTACK_SECRET_KEY | Required when enabled; only `sk_test_` secret keys are accepted, even in production |

Validation checks syntax and policy, not whether database/Redis credentials work or a provider key is valid. Length checks cannot prove randomness: generate secrets cryptographically. Authentication codes use the explicit delivery mode above and fail closed when delivery is disabled. Existing general email features may still use mock delivery without a Resend key; configure real delivery before launch. See [account security](account-security.md) for verification, password reset, step-up approvals, and provider setup.

## Paystack test integration

1. In your Paystack dashboard, open **API Keys & Webhooks** and copy the **test secret key** (`sk_test_...`). Never send the secret in chat or put it in frontend code.
2. In your ignored local `.env`, set `PAYSTACK_ENABLED=true` and `PAYSTACK_SECRET_KEY` to that key. Restrict local file access with `chmod 600 .env`. Keep `.env.example` blank.
3. Run `npm run paystack:check`. This builds the app and makes one authenticated, read-only `GET /balance` request. Success prints only `Paystack test connection verified.` No wallet balance is changed. It does not start the API or connect to the database/Redis, but requires the normal environment settings to pass validation.
4. Restart the API after changing configuration. Compose forwards both settings to the API container.

Paystack uses `https://api.paystack.co` for both environments; the key determines test or live mode. This integration deliberately accepts only test keys. No public key is needed for this server-side step. The client uses a 10-second timeout, rejects redirects, and never exposes provider error bodies or credentials. See [Paystack funding](paystack-funding.md) for initialization, signed webhooks, verification, and atomic wallet crediting.

For deployed environments, inject the key through your hosting platform's secret manager rather than a committed file or container image. Limit who can read it and rotate it in Paystack if exposed. Do not paste expanded Compose configuration or environment dumps into logs or shared messages.

References: [Paystack authentication and secret storage](https://paystack.com/docs/api/authentication/) and [read-only balance check](https://paystack.com/docs/transfers/managing-transfers/).

## Generate signing secrets

Run this command three times and place the separate outputs in `.env` under JWT_SECRET, REFRESH_SECRET, and AUTH_SECURITY_SECRET. Do not commit or share the outputs:

```bash
node -e 'console.log(require("crypto").randomBytes(48).toString("hex"))'
```

Compose requires all three secrets. Missing values cause Compose to stop with a named configuration error. Changing signing secrets invalidates existing tokens after restart; users must log in again. Changing AUTH_SECURITY_SECRET invalidates outstanding security codes and proofs and prevents decryption of queued messages, so coordinate rotations.

## Local setup and applying changes

For a new checkout, copy `.env.example` to `.env` and supply the signing secrets; also supply AUTH_SECURITY_SECRET when using Compose or production. The example contains localhost database settings for native development. Compose sets production mode and its own database/Redis addresses.

Apply code changes with `docker compose up -d --build api`. Later environment-only changes use `docker compose up -d api`.

The included PostgreSQL credentials and published database/Redis ports are for local development. They are not a production infrastructure configuration. A real deployment needs private database/Redis access and independently provisioned credentials. Changing POSTGRES_PASSWORD in Compose does not rotate the password in an already initialized PostgreSQL volume; coordinate database credential changes instead of deleting the volume.

See [account limits](account-limits.md) for policy defaults, shared daily enforcement, investigation flags and admin freeze controls.
