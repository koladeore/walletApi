# Separate API and worker processes

APP_MODE accepts combined (default), api or worker. Set it before process startup and restart to change modes. Workers/queue processors are selected when Nest module metadata is loaded; this is not a switch for a running process.

- combined: HTTP API plus funding, payout, financial operations, notification, security-delivery and legacy email workers. Convenient native development default.
- api: HTTP API/controllers, authenticated synchronous money requests and producers; no periodic workers or BullMQ email processor are registered. API-side provider verification and signed webhook processing still run when requested.
- worker: Nest application context with the background providers and no HTTP listener, Swagger or CORS surface. HTTP controllers are present in the shared module graph but cannot receive requests. The HTTP Redis rate guard is excluded.

Native commands (build once, then separate terminals):

```bash
npm run build
npm run start:api
# Another terminal:
npm run start:worker
```

Development watch variants: npm run start:api:dev and npm run start:worker:dev. Existing npm run start:dev uses APP_MODE from your environment, defaulting to combined. Do not run combined alongside worker-only unless you deliberately want extra workers. A mode without workers will not drain queued/pending work; start at least one worker process.

All processes must use the same PostgreSQL database, Redis, signing/security secrets, provider configuration and policy settings. PostgreSQL ledger entries, wallet balances, reservations, persisted references and durable events remain authoritative. Redis remains queue/rate infrastructure and never computes balances. Database leases, transactional locks and event/reference deduplication coordinate work across replicas. A process killed during delivery can leave a lease until expiry; existing retries and provider idempotency/uncertain-outcome logic handle recovery. This is not a guarantee that all in-flight jobs finish before shutdown.

SIGINT/SIGTERM shutdown hooks stop polling/queue workers and dispose database pools. Worker delivery is feature-gated by Paystack/email settings as before. Database connection budgets must include each API and worker process independently; defaults of 10 mean one API plus one worker can use up to 20 PostgreSQL connections, plus operations/migrations.

## Compose

Compose now starts api with APP_MODE=api and a separate worker service with APP_MODE=worker. Worker publishes no ports and has no inherited HTTP healthcheck. Production-mode secret validation still applies: supply a distinct strong AUTH_SECURITY_SECRET as well as JWT/refresh secrets. Native-development security-secret fallback is not a Compose production fallback.

```bash
docker compose up -d --build api worker
docker compose up -d --scale worker=2 api worker
```

Default API_PUBLISH_PORT=3000:3000 preserves the local URL and supports only one API replica. For a local multi-API demonstration, use random host ports:

```bash
API_PUBLISH_PORT=3000 docker compose up -d --scale api=2 --scale worker=2 api worker
docker compose port --index 1 api 3000
docker compose port --index 2 api 3000
```

A production deployment needs a load balancer/ingress serving one HTTPS API URL; none is installed here. Workers do not need that ingress. Scale within the PostgreSQL connection budget and monitor queue age, failures, pending payouts and reconciliation results. Worker heartbeat/readiness monitoring remains deployment preparation. API's existing Compose HTTP healthcheck is a basic HTTP check, not comprehensive dependency readiness.

## Frontend CORS

Set exact allowed frontend origins in .env, then restart:

```dotenv
CORS_ORIGINS=http://localhost:5173,http://localhost:3001
```

No trailing slash, URL path, wildcard or credentials. Empty disables cross-origin browser permission. For deployment use your actual HTTPS frontend origin. Allowed request headers are Authorization, Content-Type, x-idempotency-key and x-step-up-token. Rate-limit and Retry-After headers are exposed to browsers. Bearer-token auth is used; CORS credentials/cookies are not enabled. CORS is browser permission, not authentication or a firewall; non-browser requests still need the normal access controls.

Verification completed: build/lint, existing configuration tests, provider-selection checks across all six worker groups for all three modes, invalid runtime/CORS setting rejection, and Compose structure validation with a temporary non-persisted secret. Actual production process rollout, worker monitoring and frontend browser integration remain deployment/integration work.
