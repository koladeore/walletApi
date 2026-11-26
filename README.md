# Wallet API

A NestJS wallet backend that demonstrates how to move money consistently, integrate with a payment provider, and deploy the API and background workers independently. The project uses PostgreSQL and Prisma for financial state, Redis and BullMQ for queues and shared rate limits, and Paystack's test environment for payment flows.

## Architecture

| Component | Responsibility |
| --- | --- |
| API | Versioned REST endpoints, JWT authentication, wallet operations, and signed Paystack webhooks |
| Worker | Funding and payout follow-up, reconciliation, notification delivery, and retries |
| PostgreSQL | Wallet balances, double-entry journals, payout reservations, idempotency records, and audit trails |
| Redis | BullMQ jobs and rate limits shared across API replicas |

Native development can run both processes in `APP_MODE=combined`. Docker Compose and the local Kubernetes manifests run separate API and worker workloads. See [runtime modes](docs/runtime-modes.md) and [database performance](docs/database-performance.md) for deployment and connection budgets.

## Financial workflows and security

- [Ledger](docs/ledger.md) and [money representation](docs/money.md) use integer minor units and database constraints to enforce balanced journal postings.
- [Transfers](docs/idempotency.md), [funding](docs/paystack-funding.md), and [payouts](docs/payouts.md) use idempotency and transaction locking. Payouts reserve funds while provider outcomes are pending.
- [Financial operations](docs/financial-operations.md) cover reconciliation, reversals, and provider fees. [Account limits](docs/account-limits.md) and [admin controls](docs/admin-controls.md) cover policy enforcement, freezes, and audit records.
- [Session security](docs/sessions.md) includes access and refresh tokens, refresh rotation, and session revocation. [Account security](docs/account-security.md) adds email verification, password reset, and step-up approval.
- The API validates configuration at startup, supports exact-origin CORS, and uses shared Redis rate limits. Production mode blocks simulated funding and requires distinct signing and authentication secrets. Paystack integration accepts test keys only.

## Run locally with Docker Compose

1. Install Docker with Compose. From the repository root, copy `.env.example` to `.env`.
2. Run the following command three times. Set `JWT_SECRET`, `REFRESH_SECRET`, and `AUTH_SECURITY_SECRET` in `.env` to the three distinct outputs.

   ```bash
   node -e 'console.log(require("node:crypto").randomBytes(48).toString("hex"))'
   ```

3. Start the stack and check the API.

   ```bash
   docker compose up -d --build
   docker compose ps
   curl --fail http://localhost:3000/api/v1
   ```

Open [Swagger UI](http://localhost:3000/api/docs) to explore the API. The stack runs Prisma migrations before starting the API and worker. PostgreSQL and Redis use IPv4 loopback ports for host-side tools and internal service names for container-to-container traffic. Payment integration is disabled by default. See [configuration](docs/configuration.md) for test provider setup and secret handling.

For native development with Node.js 22, configure the same local `.env` and start PostgreSQL and Redis. With Compose, run `docker compose up -d postgres redis` to start just those services. Then run:

```bash
npm ci
npx prisma generate
npx prisma migrate deploy
npm run start:dev
```

## Test and build

```bash
npm run lint
npm test -- --runInBand
npm run build
```

Generate the Prisma client before linting or running tests. The PostgreSQL integration suites require `LEDGER_TEST_DATABASE_URL` to target a fresh disposable database whose name starts with `wallet_ledger_test`. Run `npm run test:ledger` first to apply and exercise the migrations against the empty database. Then run `test:funding`, `test:beneficiaries`, `test:payouts`, `test:operations`, and `test:security` with `npm run`. Always keep this database separate from application data.

## Delivery and deployment

| Workflow | What the repository provides |
| --- | --- |
| GitHub Actions | Lint, Prisma generation and migrations on a test database, Jest, a TypeScript build, and a production image build. Pushes to `main` publish commit-tagged and `latest` images to GHCR. |
| Docker | A multi-stage [Dockerfile](Dockerfile) builds the Prisma client and TypeScript, prunes development dependencies, and runs as a non-root user. [Compose](compose.yml) starts PostgreSQL, Redis, a migration task, the API, and a worker. |
| Kubernetes | [Local development manifests](k8s/README.md) demonstrate separate deployments, persistent storage, probes, a migration job, ingress, and CPU-based API autoscaling. They expect locally loaded images and use HTTP ingress for the demo. |
| AWS | [ECR and GitHub OIDC policy templates](deploy/aws/README.md) show how to scope image-publishing permissions to one ECR repository and one GitHub branch. |
| Render | The [Render guide](docs/render-deployment.md) describes the development/test blueprint and hosted configuration. |

Use synthetic accounts and sandbox payment data for portfolio demos. Keep provider and signing secrets in local environment files or a deployment secret store. A shared deployment needs HTTPS, private database and Redis access, least-privilege credentials, and monitoring of application dependencies and background processing.
