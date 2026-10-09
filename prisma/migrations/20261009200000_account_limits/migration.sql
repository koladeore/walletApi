ALTER TABLE users ADD COLUMN "accountTier" TEXT NOT NULL DEFAULT 'BASIC' CHECK ("accountTier" IN ('BASIC','VERIFIED'));
CREATE TABLE daily_outgoing (id TEXT PRIMARY KEY, "userId" TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT, day TEXT NOT NULL, "amountMinor" BIGINT NOT NULL DEFAULT 0 CHECK ("amountMinor">=0), UNIQUE("userId",day));
CREATE TABLE activity_flags (id TEXT PRIMARY KEY, key TEXT NOT NULL UNIQUE, "userId" TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT, kind TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'OPEN', details JSONB NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "resolvedAt" TIMESTAMP(3), resolution TEXT);
CREATE INDEX activity_flags_status_created_idx ON activity_flags(status,"createdAt");
-- Historical outgoing requests count conservatively on rollout, including failed payouts.
INSERT INTO daily_outgoing(id,"userId",day,"amountMinor")
SELECT "userId" || ':' || day, "userId", day, sum(amount)::bigint FROM (
 SELECT w."userId", to_char(t."createdAt" AT TIME ZONE 'UTC' AT TIME ZONE 'Africa/Lagos','YYYY-MM-DD') AS day, t."amountMinor" AS amount
 FROM transactions t JOIN wallets w ON w.id=t."senderWalletId" WHERE t.type='TRANSFER' AND t.status='SUCCESS' AND t."reversalOfId" IS NULL
 UNION ALL
 SELECT "userId", to_char("createdAt" AT TIME ZONE 'UTC' AT TIME ZONE 'Africa/Lagos','YYYY-MM-DD'), "amountMinor" FROM payouts
) history GROUP BY "userId",day;
