# Durable welcome emails and failed-delivery recovery

Apply prisma generate and migrate deploy, then restart. New signup saves its user, NGN wallet and WELCOME notification together. Queue/provider downtime cannot lose a committed welcome event. The notification's database row is the durable queue: workers lease pending rows directly, so there is no unreliable database-to-Redis enqueue gap. A rolled-back signup cannot leave a welcome event behind. No welcome-event backfill is performed for existing users.

WELCOME can send before email verification. Financial emails still require verified email. Delivery uses the existing Resend settings and NOTIFICATION_EMAIL_ENABLED toggle. Production domain configuration remains deferred. Read notifications remain informational; delivery recovery never updates wallets, ledger entries or provider payments.

## Admin endpoints

- GET /api/v1/admin/notification-deliveries?status=FAILED&limit=20: cursor-paginated failure list. status may be FAILED, SKIPPED or PENDING. Normal ADMIN bearer authentication is required; reads are audited.
- GET /api/v1/admin/notification-deliveries/{id}: safe delivery status, lifetime attempts, current-batch attempts, first-attempt time, recovery count, last failure code and next-attempt/lease times. No passwords, codes, provider bodies or recipient addresses are exposed.
- POST /api/v1/admin/notification-deliveries/{id}/retry with `{ "reason": "Provider sender verification fixed" }`: ADMIN step-up required, bound to this exact POST path and reason body.

Request an ADMIN proof as documented in account-security.md using the retry path/body, confirm the email code, then supply x-step-up-token. Retry returns the updated delivery record; it queues the work, not a delivery-success promise. SENT is provider acceptance, not proof of inbox delivery.

Only FAILED or SKIPPED rows are eligible. Recipient must be active/open and unchanged; financial recipients must have verified email. Notification email delivery must be enabled. The sender/recipient snapshot and notification-${id} idempotency key are retained. Operators should fix the rejected sender/domain/provider configuration before retrying; changing sender configuration does not rewrite an already-attempted message's snapshot.

Retries are allowed within one hour of the first attempted send, with at most three admin recoveries and five worker attempts per batch. Never-attempted events do not expire merely because the service was down, so they can resume after a longer outage. A snapshot is persisted before provider I/O; a crash after that point is treated conservatively as potentially attempted. Do not manually erase first-attempt/sender/recipient history to bypass eligibility.

Recovery resets batch attempts but keeps lifetime emailAttempts and increments emailRecoveryCount. Concurrent recovery requests serialize on the delivery row: the first sets PENDING, later attempts are rejected. Each successful requeue records actor, notification ID, target user, previous status/failure and reason. Worker leases prevent routine duplicate claims; expired leases are reclaimable after restart. Reusing stable provider idempotency within the conservative retry window protects uncertain send outcomes, without claiming exactly-once physical delivery.

Safe failure codes include PROVIDER_HTTP_<status>, DELIVERY_UNCERTAIN, ATTEMPTS_EXHAUSTED, EVENT_EXPIRED, RECIPIENT_INELIGIBLE and LEGACY_DELIVERY_REVIEW_REQUIRED. No raw provider response bodies are stored. Legacy attempted pending/failed/skipped notifications lack the new sender snapshot and are migrated to SKIPPED/LEGACY_DELIVERY_REVIEW_REQUIRED; automated/admin retry is refused. Investigate those manually rather than risking a duplicate. Sent records remain sent.

Security-code emails live in security_deliveries, not this admin interface. Expired codes must be requested afresh using the existing verification/recovery flow; this endpoint cannot replay OTPs. Legacy BullMQ jobs remain separate and are not replayed automatically by this feature.

## Checks

Disposable database checks verified atomic signup/welcome creation, safe provider failure, concurrent requeue deduplication, audit creation, cumulative attempts, stable event identity, one worker claim and sent-event rejection. Provider sends were mocked; no real email was sent by verification tooling.

Manual flow: create a test user and inspect its WELCOME delivery. Complete a fresh funding for a verified test user. If a notification email fails, inspect its safe error code, fix the provider issue, request an exact admin retry proof, and retry the notification ID. Confirm PENDING then SENT, one original in-app item, and unchanged balance. A regular user or admin without a valid matching proof must be rejected. Restart while a pending event exists and confirm it resumes; an expired worker lease should be reclaimed.
