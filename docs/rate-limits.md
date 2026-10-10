# Shared Redis rate limiting

The global controller guard uses the same Redis configured by REDIS_HOST/REDIS_PORT. All API replicas must connect to the same authoritative Redis, use this key namespace, and use matching policy settings. There is no in-memory fallback. No database migration is needed. Restart after changing settings.

Fixed-window budgets (60 seconds from first hit):

| Policy | IP budget | Account budget | Applies to |
| --- | --- | --- | --- |
| login | 10 | 5 | POST /auth/login |
| money | 20 | 10 | POST /wallet/transfer and new POST /wallet/payouts |
| read | 120 | 120 | Controller GET/HEAD requests |
| write | 30 | 20 | Other mutations, including refresh, recovery, verification and admin actions |

All routes within a policy share its bucket; changing endpoint or payout reference does not reset it. Policies are selected from the matched controller/handler and HTTP method, not raw URL spelling. Retries and rejected attempts count. Fixed windows can permit a burst spanning a boundary; these are traffic/brute-force controls, not monetary limits.

Settings RATE_LOGIN_IP_LIMIT / RATE_LOGIN_ACCOUNT_LIMIT, RATE_MONEY_IP_LIMIT / RATE_MONEY_ACCOUNT_LIMIT, RATE_READ_IP_LIMIT / RATE_READ_ACCOUNT_LIMIT, RATE_WRITE_IP_LIMIT / RATE_WRITE_ACCOUNT_LIMIT accept integers 1–10000. Compose forwards them. Keys have expirations and hashed identities; no email, password or raw JWT is stored in limiter keys. An unkeyed hash is pseudonymization, not anonymization.

Every request consumes an IP budget. Login additionally uses a normalized email bucket, even when the account does not exist. Requests with a cryptographically valid access token additionally use a user-ID budget; route authentication separately validates live session/account state. Anonymous requests have only IP limits. Refresh does not infer account identity from its refresh-token body. Shared-IP users can collectively reach IP limits, so choose policy values for expected traffic and monitor 429 rates.

Redis Lua increments/checks related buckets atomically across instances. Keys use the common {shared} hash tag so the operation remains single-slot compatible; this is one slot, not distributed multi-slot capacity planning. Requests exceeding a budget return 429 with Retry-After (seconds). X-RateLimit-Policy, X-RateLimit-Remaining and X-RateLimit-Reset (seconds remaining, not Unix time) describe the limiting budgets. X-RateLimit-Limit-IP and, when applicable, X-RateLimit-Limit-Account expose configured budgets. Queue retries and background jobs do not consume HTTP budgets.

Redis unavailable or command timeout returns 503. There is no local bypass; storage failures are sanitized and warning output is bounded. Startup may temporarily return 503 while Redis connects. Counters are not an audit archive; Redis restarts/data loss can reset limits. The development Compose Redis already enables append-only persistence. Hosted failover/durable Redis setup remains deployment work.

Paystack webhook delivery is exempt to preserve provider retries; raw signature verification and durable event deduplication remain its protection. Frontend callback reads still use read limits. Static Swagger assets are not controller requests and are outside this guard.

## Proxy IP handling

Default TRUST_PROXY_IPS is empty, so Express ignores forwarded addresses. Behind a reverse proxy, set comma-separated actual proxy IP addresses. For a local ngrok proxy only, TRUST_PROXY_IPS=loopback may be appropriate. Never configure trust-all for a publicly reachable backend. Ensure direct access is restricted to trusted proxies and that they sanitize forwarded headers. An incorrect proxy setting can group clients under one proxy IP or allow spoofed client addresses. These controls key by IP address, not IPv6 subnet; subnet/network abuse defenses and edge-level protection are separate.

## Verification

Two independent guard instances were verified against local Redis using uniquely named temporary keys: shared budget exhaustion returned 429 with Retry-After and key expiry; an unreachable Redis endpoint returned 503. Existing configuration tests pass. No production limits were changed externally.

Manually: send more than the login allowance using a test email and expect 429; wait the Retry-After delay. Read endpoints should still have their separate budget. Repeat from two API replicas pointed at the same Redis to confirm a single shared budget. Test only controlled accounts/IPs because failed login attempts intentionally count too. A money request rejected after its single-use step-up proof was consumed may require a new proof according to the existing security flow; global rate rejection occurs before route guards.
