# Account limits, activity flags and freezes

Apply prisma generate and migrate deploy, then restart. Existing users start BASIC. The migration backfills daily usage from successful internal transfers and all recorded payout requests; historical reversed/failed payouts count conservatively. Amounts and settings use NGN decimal strings.

| Tier | Per transaction | Shared daily outgoing |
| --- | --- | --- |
| BASIC | ₦50,000 | ₦100,000 |
| VERIFIED | ₦100,000 | ₦500,000 |

These are configurable development business defaults, not regulatory limits. Both tiers require verified email to send money. VERIFIED is a manual admin approval after review; it does not mean identity/KYC verification was implemented. New registrations cannot choose a tier.

Settings: LIMIT_BASIC_TRANSACTION_NGN, LIMIT_BASIC_DAILY_NGN, LIMIT_VERIFIED_TRANSACTION_NGN, LIMIT_VERIFIED_DAILY_NGN. Positive amounts only, at most two decimals; transaction limit must not exceed daily. Invalid policy stops startup. Compose forwards the settings. Restart after changes. A lowered limit applies immediately to new outgoing requests even if existing usage already exceeds it.

GET /api/v1/wallet/limits returns tier, email status, day, timezone, limits, usage, remaining allowance, and freeze status. Days reset at midnight Africa/Lagos (UTC+1). Transfers and payouts consume the same daily allowance atomically under the sender wallet lock. Failed transactions roll back allowance. Duplicate idempotent requests do not consume twice. Once a payout request commits, failures and reversals do not restore daily allowance, even though its financial reservation may be released. Funding and incoming transfers do not consume outgoing allowance. Administrative corrections/reversals are excluded; existing payout settlement proceeds when frozen.

Defined suspicious-activity patterns: five committed outgoing requests in ten minutes, or reaching 90% of daily usage. The triggering successful request creates one investigation flag per user/day/pattern. Flags do not automatically freeze or declare fraud. Rejected requests are not counted in these patterns. A resolved same-day flag is not reopened; broader fraud controls remain future work.

Admin endpoints (bearer ADMIN plus exact ADMIN step-up proof and a reason):

- POST /api/v1/admin/account-controls/users/{id}/tier with `{ "tier": "VERIFIED", "reason": "Manual account review approved" }`.
- POST /api/v1/admin/account-controls/users/{id}/freeze with `{ "reason": "Investigate unusual outgoing activity" }`. id is the USER id. Freezes outgoing transfers and new payouts; funds are retained.
- GET /api/v1/admin/account-controls/flags lists cursor-paginated open flags, audited; no step-up needed for reading.
- POST /api/v1/admin/account-controls/flags/{id}/resolve with a reason records the investigation; it does not unfreeze.
- Existing POST /api/v1/admin/financial-operations/wallets/{id}/unfreeze uses the WALLET id. Resolve activity flags, financial disputes and reconciliation issues first. Requires its existing reason and exact ADMIN proof.

Every admin change records actor, target, timestamp and reason. Tier updates serialize with outgoing authorization. Freeze updates serialize with wallet mutations. The system does not cancel a payout already sent to Paystack; its outcome must still be reconciled.

Manual checks: read limits; attempt one amount above the transaction maximum and expect 400 with no balance/usage change. Send two allowed amounts whose total exceeds the daily limit; the exceeding request must fail. Retry a committed request with its original idempotency key and fresh proof: usage must stay unchanged. Verify concurrent requests cannot exceed the daily cap. Make five small outgoing requests to produce a flag. Freeze using an admin, then verify new transfers/payouts fail with 403 while incoming credits still work. Resolve flags and unfreeze after investigation. Regular users cannot access admin endpoints.

See [pagination](pagination.md) for page limits, cursor parameters and frontend response changes.
