CREATE TABLE auth_sessions (
 id TEXT PRIMARY KEY, "userId" TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
 "userAgent" TEXT, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "lastUsedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "expiresAt" TIMESTAMP(3) NOT NULL,
 "revokedAt" TIMESTAMP(3), "revokeReason" TEXT
);
CREATE INDEX "auth_sessions_userId_revokedAt_idx" ON auth_sessions("userId", "revokedAt");
CREATE TABLE session_refresh_tokens (
 id TEXT PRIMARY KEY, "sessionId" TEXT NOT NULL REFERENCES auth_sessions(id) ON DELETE RESTRICT,
 "tokenHash" TEXT NOT NULL UNIQUE, "expiresAt" TIMESTAMP(3) NOT NULL,
 "consumedAt" TIMESTAMP(3), "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "session_refresh_tokens_sessionId_idx" ON session_refresh_tokens("sessionId");
-- Legacy tokens lack session identity; require login after this migration.
UPDATE auth_tokens SET "isRevoked"=true WHERE "isRevoked"=false;
UPDATE users SET "authVersion"="authVersion"+1;
