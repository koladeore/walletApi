# Login sessions and refresh rotation

Apply `npx prisma generate`, `npx prisma migrate deploy`, and restart the API. This migration invalidates existing tokens: everyone must log in again. Multiple devices can then stay logged in independently.

Login and refresh return `accessToken`, `refreshToken`, `sessionId`, `sessionExpiresAt`, and `user`. Use accessToken as bearer authorization. Refresh accepts `{ "refreshToken": "LATEST_TOKEN" }` without bearer authorization. Store BOTH replacement tokens after success. Each refresh has a cryptographically unique token ID and its full SHA-256 hash is stored, avoiding bcrypt's 72-byte truncation for long JWTs.

Rotation consumes the old token and inserts its replacement in one database transaction. Used tokens remain recorded for reuse detection until the session expires. Reusing one revokes that session and records an audit event; other devices remain usable. Concurrent refreshes using the same token have this same consequence: one may return tokens, but the second request revokes them. Coordinate one refresh at a time across tabs and requests. After an uncertain refresh/network timeout, login again instead of replaying the old refresh token.

Session expiry is fixed at login using REFRESH_EXPIRES_IN; refreshing does not extend it. Access authorization checks live session status on every request, so revoked sessions stop authenticating immediately, even if their JWT exp is later. A request already authorized and in progress may complete; revocation prevents subsequent authorization.

- `GET /api/v1/auth/sessions`: active sessions only. Each row includes id, userAgent, createdAt, lastUsedAt, expiresAt, current. User-Agent is an untrusted browser/device hint; lastUsedAt means login/refresh activity, not every API request.
- `POST /api/v1/auth/sessions/{id}/logout`: use session id from the list; revokes that session's access and refresh tokens. Requires bearer authorization. Cannot revoke another user's session.
- `POST /api/v1/auth/logout`: existing refresh-token body; revokes the corresponding whole session. Invalid credentials return a generic success; infrastructure errors are not silently swallowed.
- `POST /api/v1/auth/logout-all`: bearer authorization; revokes all sessions including the caller and invalidates existing security proofs. Clear local tokens and return to login.

Password reset revokes all sessions too. Account authorization-version changes also invalidate tokens. Inactive/closed users cannot authenticate or refresh. Login, reuse detection, selected logout, and logout-all create audit records without logging token contents.

Manual verification: log in twice (different browsers); confirm different sessionId values and two list rows. Rotate one token; reuse its old token and expect 401, then verify that session's new access token fails but the second browser still works. Log in again; revoke a chosen session by id and check its bearer token fails. Finally call logout-all and verify all previous access/refresh tokens fail. An expired token must fail and foreign session IDs must return 404.
