# Query indexes and database connection limits

Apply `npx prisma generate`, `npx prisma migrate deploy`, then restart the API. The migration adds indexes; it does not change balances or financial records. Ordinary index builds can block writes while building: use a maintenance window for populated databases. Large live installations need an operator-managed concurrent index rollout before deploying equivalent schema changes; do not run ordinary builds during peak traffic.

Indexes match the list predicates and stable cursor ordering:

| Query | Index columns |
| --- | --- |
| Transaction history | senderWalletId / receiverWalletId, createdAt, id (one index for each direction) |
| Users | createdAt, id |
| Payouts and beneficiaries | userId, createdAt, id |
| Notifications | userId, createdAt, id; unread queries additionally readAt |
| Active sessions | userId, revokedAt, createdAt, id |
| Reconciliation runs | startedAt, id |
| Open reconciliation issues | status, firstSeenAt, id |
| Cases / provider fees | createdAt, id |
| Activity flags | status, createdAt, id |

Existing ledger account/date, journal, reservation wallet/status, provider-worker status/due-time and idempotency indexes remain. Indexes add write/storage cost. Some older prefix indexes overlap these new indexes; inspect actual usage before removing them in a separate migration. A wallet transaction OR predicate can produce a BitmapOr plus sort rather than a single ordered index scan; inspect representative history sizes rather than assuming the new indexes remove every sort. This step does not optimize the full reconciliation scans or introduce a balance cache.

## Inspect actual plans

Start PostgreSQL and apply migrations, then:

```bash
npm run db:plans
npm run db:plans -- --wallet-id=YOUR_WALLET_UUID --user-id=YOUR_USER_UUID
```

The command executes fixed SELECT queries with EXPLAIN ANALYZE/BUFFERS/JSON in a read-only transaction. It checks first-page users, runs/issues, wallet transaction first/next pages, payouts, beneficiaries, unread notifications and sessions. It prints node/index names, actual row/loop counts, buffer reads/hits, planning/execution times and connection counts; it does not print credentials or record contents. It uses a 15-second statement timeout and a 2-second lock timeout. EXPLAIN ANALYZE actually runs the SELECT, so inspect representative data in staging or at quiet times. With no arguments the newest wallet is sampled; that may have no history.

Review rows removed, high reads, sorts and scans over large tables. Tiny/empty tables may legitimately use sequential scans. Keep planner statistics current (normal autovacuum/analyze or operator-approved ANALYZE after bulk loads). Do not disable sequential scans to manufacture an index result. Cursor performance must be measured with realistic wallet/date distributions and deep histories.

Current verification: application build and configuration checks cover the new settings; local PostgreSQL was refusing connections during implementation, so actual query-plan inspection remains pending. No performance improvement is claimed without those plans.

## Bound connections and waits

Each API process currently also hosts background workers and shares one global Prisma pool. Defaults:

| Setting | Default | Allowed |
| --- | --- | --- |
| DB_POOL_MAX | 10 | 1–100 connections per process |
| DB_CONNECTION_TIMEOUT_MS | 5000 | 100–60000 ms |
| DB_IDLE_TIMEOUT_MS | 30000 | 1000–600000 ms |
| DB_STATEMENT_TIMEOUT_MS | 15000 | 1000–300000 ms |
| DB_LOCK_TIMEOUT_MS | 5000 | 100–60000 ms; less than statement timeout |

The actual node-postgres adapter pool receives these settings; Prisma URL `connection_limit` is not how this adapter is configured. Pool disposal closes idle connections on Prisma shutdown. Idle pool/connection errors are sanitized. PostgreSQL statement/lock timeouts apply per SQL statement, not as an HTTP deadline or overall job deadline. Existing interactive transaction timeouts can expire earlier. Provider timeouts still follow their separate settings. A database timeout during financial work must follow the existing idempotency/uncertain-outcome flow, never a blind new payout request.

Compose sets server max_connections using POSTGRES_MAX_CONNECTIONS (default 100). Changing it requires restarting PostgreSQL and interrupts existing connections. This is not a hosted database setting: configure the server through the host/provider for deployments outside Compose. Server settings reserve some connections for administrators; keep additional operational headroom.

Budget every process and service: sum(replica count × DB_POOL_MAX) + migrations + scripts + monitoring + other apps must stay below the usable server ceiling with spare operator capacity. For example, a server ceiling of 100 with 20 connections kept for reserves/operations allows at most 8 application processes at pools of 10. Revisit this budget before separating/scaling API and workers. A connection proxy such as PgBouncer is not installed by this change.
