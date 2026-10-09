# Email, recovery, and sensitive-action checks

Phone numbers are not required; phone verification and SMS delivery are deferred.

This step adds email verification, password recovery, and action-bound step-up checks. It does not enable authenticator-app MFA, passkeys, or require a second factor on every login. Session identifiers, atomic refresh rotation/reuse detection, device management, and logout-all-devices are the next checklist item; password reset already revokes existing sessions using `authVersion` and refresh-token revocation.

Apply the migration and restart:

```bash
npx prisma generate
npx prisma migrate deploy
npm run start:dev
```

Existing accounts start with unverified email. Login remains available so they can verify their contact details. Sensitive routes require verified email and a single-use step-up proof; there is no legacy-account bypass.

## Explicit local test delivery

For native development against your test database, set:

```dotenv
NODE_ENV=development
AUTH_DELIVERY_MODE=test
```

Test delivery writes an encrypted database inbox; it does not send email or return codes in HTTP responses. Set a separate random `AUTH_SECURITY_SECRET` if desired. In development/test, an omitted or blank value derives security keys from JWT_SECRET. Production requires a distinct strong AUTH_SECURITY_SECRET and rejects test delivery. Docker Compose runs in production mode, so use native development for this test inbox or configure real provider delivery.

After requesting a code, read it locally with:

```bash
npm run auth:test-inbox -- your-user@example.com
```

This operator-only CLI prints active test codes and challenge IDs using your local database credentials. It is not an HTTP endpoint and refuses production/non-test delivery. Keep its output private. Encryption protects stored delivery content; the operator with database credentials and the server key can decrypt it. Consumed codes are scrubbed and no longer appear.

## Verify email in Swagger

1. Login and authorize Swagger with your access token.
2. Call `POST /api/v1/auth/security/email/request`. Copy `challengeId`.
3. Read the test inbox (or your actual email in provider mode).
4. Call `POST /api/v1/auth/security/email/confirm`:

   ```json
   { "challengeId": "YOUR_CHALLENGE_UUID", "code": "YOUR_SIX_DIGIT_CODE" }
   ```

5. `GET /api/v1/auth/security/status` should show `emailVerified: true`.

Codes must be strings to preserve leading zeros. They expire after 10 minutes, are bound to a user and purpose, and are single-use. Five failed guesses lock a challenge. Requests have a 60-second per-purpose cooldown and a 10-request per-account hourly limit, in addition to the API's global IP throttling.

## Step up before a sensitive action

For a payout, first request step-up:

```text
POST /api/v1/auth/security/step-up/request
```

```json
{
  "password": "YOUR_CURRENT_PASSWORD",
  "action": "PAYOUT",
  "details": { "beneficiaryId": "YOUR_BENEFICIARY_UUID", "amount": "100.00" }
}
```

Read the delivered email code, then call `POST /api/v1/auth/security/step-up/confirm` with its `challengeId` and `code`. It returns a `stepUpToken`, valid for five minutes and one use. Pass it as `x-step-up-token` when calling `POST /api/v1/wallet/payouts`, alongside the normal bearer token and idempotency key.

The requested beneficiary and exact minor-unit amount must match. Changing the recipient, amount, action, or user invalidates the proof. `100` and `100.00` are equivalent; email recipient casing remains exact because existing email records are case-sensitive. Request bodies and paths are bound for staff operations.

Other actions:

| Action | Required details | Protected route |
| --- | --- | --- |
| TRANSFER | `receiverEmail`, `amount` | `POST /wallet/transfer` |
| BENEFICIARY | `bankCode`, `accountNumber` | `POST /beneficiaries` |
| ADMIN | `method`, full API `path`, exact `body` | User status/closure, internal reversal, issue resolution, wallet unfreezing |

For example, a staff status change uses:

```json
{
  "password": "YOUR_CURRENT_PASSWORD",
  "action": "ADMIN",
  "details": {
    "method": "PATCH",
    "path": "/api/v1/users/TARGET_USER_UUID/status",
    "body": { "isActive": false, "reason": "Account investigation" }
  }
}
```

ADMIN proofs require a current administrator role as well as verified email. Read-only routes, provider webhooks, and automatic financial reconciliation do not require a customer action proof. A payout verification route cannot send a new payout, so it remains accessible with normal authentication.

Proofs are consumed before the handler runs. If DTO validation, a provider request, or a money operation fails afterward, request a fresh proof before retrying. Use the same financial idempotency key to avoid a second transaction. The authorization version is rechecked inside money/staff-action transactions, so a password reset between step-up and mutation prevents stale authorization from being used.

## Password recovery

`POST /api/v1/auth/security/password/request-reset` is public:

```json
{ "email": "your-user@example.com" }
```

The response is identical for unknown, inactive, throttled, or delivery-unavailable accounts and includes no code/challenge ID. Delivery is queued, so provider network latency does not affect this response. Read the challenge ID and code from the email or local test inbox.

Call the public `POST /api/v1/auth/security/password/reset`:

```json
{
  "challengeId": "YOUR_RESET_CHALLENGE_UUID",
  "code": "YOUR_SIX_DIGIT_CODE",
  "newPassword": "A_NEW_PASSWORD_OF_AT_LEAST_12_CHARACTERS"
}
```

New passwords must be at least 12 characters and at most 72 UTF-8 bytes (bcrypt's input boundary). Reset never logs the user in automatically. It changes the password, increments authorization version, revokes refresh tokens, and invalidates other challenges/proofs atomically. Old access and refresh tokens must stop working; login with the new password. Old refresh tokens also cannot revoke a newly issued session through logout.

## Real delivery configuration

Use a distinct cryptographically random AUTH_SECURITY_SECRET of at least 32 characters. Inject it through environment configuration or your secret manager. Rotating it invalidates outstanding codes/proofs and prevents decrypting pending delivery jobs; users should request new codes.

```dotenv
AUTH_DELIVERY_MODE=provider
AUTH_SECURITY_SECRET=YOUR_DISTINCT_RANDOM_SECRET
RESEND_API_KEY=YOUR_RESEND_KEY
AUTH_EMAIL_FROM=security@your-verified-domain.example
```

Use a verified Resend sender. The worker polls every five seconds, uses HTTPS without redirects, retries delivery failures with bounded backoff, and stops after expiration or five attempts. Resend requests use a stable idempotency key. Delivery acceptance is not a guarantee the recipient received a message; validate actual email delivery with your provider account before production.

Pending delivery content is AES-GCM encrypted, OTP/proof verification uses server-keyed hashes, and codes/proofs/passwords are excluded from request logs and audit metadata. Provider error bodies are not stored or exposed. Security requests, failed code attempts, confirmations, and proof use create audit records.

## Tests

Try wrong, expired, replayed, cross-user, and cross-purpose codes. Change the amount/beneficiary after receiving a payout proof and expect rejection. Repeat password reset with the same code and expect rejection; old tokens must remain invalid. Database tests force concurrent confirmations and proof consumption so only one can succeed.

```bash
npm test -- --runInBand --watchman=false
# Only on a migrated disposable wallet_ledger_test* database:
npm run test:security
```

Provider sends are mocked in tests. The encrypted inbox verifies the local flows end to end without sending real messages. Production notification delivery, authenticator MFA, identity/compliance checks, account tiers, and session/device management remain separate milestone work.

References: [OWASP recovery guidance](https://cheatsheetseries.owasp.org/cheatsheets/Forgot_Password_Cheat_Sheet.html), [Resend email API](https://resend.com/docs/api-reference/emails/send-email).
