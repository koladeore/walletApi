# Deploy the API to Render

This Blueprint creates a paid, always-on Node API, PostgreSQL database and private
Redis-compatible Key Value instance in Frankfurt. Review Render's displayed cost
before creating resources. This is a frontend development/test-payment deployment:
the application only accepts Paystack test keys, even with NODE_ENV=production.

## Create the deployment

1. Commit and push `render.yaml` and the source changes to
   `https://github.com/koladeore/walletApi`.
2. In the Render dashboard choose **New → Blueprint**, connect that repository,
   and select the branch containing `render.yaml`.
3. Enter the requested secrets directly in Render:
   - `RESEND_API_KEY`: a Resend API key.
   - `AUTH_EMAIL_FROM`: a bare email address on your verified Resend domain.
   - `PAYSTACK_SECRET_KEY`: your Paystack `sk_test_...` secret key.
   Never put these in frontend code or commit `.env`.
4. Review the three resources and their costs, then create the Blueprint.
5. Wait for PostgreSQL/Redis provisioning, the API build, Prisma migration command
   and API startup to succeed. Render supplies PORT and generates the three
   signing/security secrets separately. Database migrations run before startup.
6. Open the API's assigned HTTPS URL from Render, then `/api/docs`. All application
   endpoints have the `/api/v1` prefix. The root application endpoint is
   `/api/v1` and returns `Hello World!`; it also exercises Redis rate limiting.

The initial service uses APP_MODE=combined, so email, funding, payout and other
workers run alongside HTTP. Do not switch it to api mode without provisioning a
worker with the same database, Redis and secrets. Auto-deploy is off; use Manual
Deploy for subsequent updates after checking CI.

## Connect the frontend

For a Vite frontend, set the public API base URL to:

```dotenv
VITE_API_BASE_URL=https://YOUR-ASSIGNED-SERVICE.onrender.com/api/v1
```

Use the actual URL Render assigns. Swagger is at `/api/docs`, without `/v1`.
The Blueprint permits localhost ports 5173 and 3001. Add your deployed frontend's
exact HTTPS origin to CORS_ORIGINS in Render, comma-separated without a trailing
slash or path, then redeploy. Frontend requests use bearer access tokens.
See the Swagger examples for refresh, email verification, step-up proofs,
idempotency headers and payment status handling.

Set the Paystack test webhook URL to:

```text
https://YOUR-ASSIGNED-SERVICE.onrender.com/api/v1/paystack/webhook
```

Verify registration/login, actual verification-email delivery, a test checkout
and its resulting wallet balance before building the full frontend flow.
Check worker logs if an email or payment status stays pending.

## Operational limits

The Blueprint uses private database and Redis connections without Redis internal
authentication. The current Redis clients accept host/port only; enabling internal
authentication requires adding password support first. Redis uses noeviction for
BullMQ queues. The service has no custom readiness endpoint; Render's default TCP
check does not verify all dependencies or workers.

TRUST_PROXY_IPS stays unset because the application only accepts explicit trusted
IP addresses. Confirm the ingress proxy addresses before configuring it; otherwise
IP rate limits may be shared by requests arriving through the same proxy. Account
rate limits still apply. Do not broadly trust client-supplied forwarded headers.

This setup has not been deployed by the local preparation step. A successful local
build does not verify Render provisioning, provider credentials or email delivery.

References: [Render Blueprints](https://render.com/docs/blueprint-spec),
[Node versions](https://render.com/docs/node-version),
[Key Value](https://render.com/docs/key-value).
