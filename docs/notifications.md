# Persistent notifications and email

Apply prisma generate and migrate deploy, then restart. Notifications are created for NEW successful Paystack funding, outgoing/incoming internal transfers, final payout success/failure/reversal, and outgoing wallet freeze/unfreeze transitions. Historical events are not backfilled. Simulated funding and internal administrative reversals are excluded.

Notifications are inserted by database triggers inside the financial transaction, so rollback cannot leave a false success message. Stable unique event keys deduplicate transfer/funding/payout events. Freeze notifications are generated only when the boolean actually changes; freezing, unfreezing, then freezing again are distinct events. Repeated webhook processing without another state transition creates no extra notification. The old simulated-push worker and separate transfer email jobs are no longer used for new transfers.

Authenticated frontend endpoints:

- GET /api/v1/notifications?page=1&unreadOnly=false: newest first, 20/page, with data, meta and unreadCount. Each item has id, kind, title, body, data, readAt (null means unread), createdAt. Render title/body as plain text. Metadata supplies transactionId, reference or walletId and amountMinor/currency when applicable. Fetch wallet/payment endpoints for authoritative status.
- GET /api/v1/notifications/unread-count: `{ "unreadCount": 3 }`.
- POST /api/v1/notifications/{id}/read: returns the item; repeated calls preserve its original read timestamp. A foreign/missing notification returns 404.
- POST /api/v1/notifications/read-all: `{ "updated": 3 }`. Updates this user's currently unread rows only. Notifications arriving later remain unread.

No public endpoint creates messages or exposes another user's notifications. No push/SMS provider is needed. Poll the list/count as appropriate; WebSocket/browser push is not part of this step.

Email delivery reuses AUTH_DELIVERY_MODE=provider, RESEND_API_KEY and AUTH_EMAIL_FROM. NOTIFICATION_EMAIL_ENABLED defaults true; set false to pause notification emails without disabling security-code emails. Local AUTH_DELIVERY_MODE=test does not send notification emails. In-app notifications persist independently of email success.

The database-backed worker checks every five seconds, leases each delivery for 60 seconds, and uses a stable Resend idempotency key and recipient across retries. It makes HTTPS requests with a 10-second timeout, retries transient/network failures with backoff, and stops after five failed attempts. Permanent provider rejection is FAILED. Email for events older than one hour, inactive/closed/unverified accounts, or changed recipients is SKIPPED. Reading a notification does not cancel its email. SENT means Resend accepted it, not that it reached the inbox. Delivery status and attempts are available to trusted operators in the notifications table; they are not exposed in the frontend response. Provider error bodies and credentials are not logged.

Current Resend test-sender restrictions still apply: onboarding@resend.dev delivers only to the email on your Resend account. Production sender/domain configuration remains deferred. The sender worker needs no new service.

Manual checks: complete a fresh test funding, confirm one FUNDING_SUCCESS item and an unread count increase. With provider mode and your eligible Resend-account email, check the email and spam folder. Repeat payment verification: no extra item/email should be created. Mark one item read, check the count falls, then repeat reading and verify its timestamp stays the same. A second user must receive 404 when trying to mark the first user's item read. Check transfer sender and recipient each receive their own item, and payout final outcomes and freeze transitions also appear.

Email acceptance cannot guarantee exactly-once physical delivery by external mail systems. Stable event identity, transaction persistence, worker leases and provider idempotency protect against ordinary retry duplicates. This is not production email-domain configuration, browser push, a support inbox, or a guaranteed-delivery archive.

See [pagination](pagination.md) for page limits, cursor parameters and frontend response changes.
