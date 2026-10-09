BEGIN;
ALTER TABLE users ADD COLUMN "emailVerifiedAt" TIMESTAMP(3);
ALTER TABLE users ADD COLUMN phone TEXT;
ALTER TABLE users ADD COLUMN "phoneVerifiedAt" TIMESTAMP(3);
CREATE UNIQUE INDEX users_phone_key ON users(phone);
ALTER TABLE users ADD CONSTRAINT users_phone_format CHECK (phone IS NULL OR phone ~ '^\+[1-9][0-9]{7,14}$');
CREATE TABLE security_challenges (
 id TEXT PRIMARY KEY,"userId" TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
 purpose TEXT NOT NULL CHECK(purpose IN ('EMAIL','PHONE','RESET','STEP_UP')),
 target TEXT NOT NULL,"codeHash" TEXT NOT NULL,"authVersion" INTEGER NOT NULL,binding TEXT,action TEXT,
 attempts INTEGER NOT NULL DEFAULT 0 CHECK(attempts>=0),"expiresAt" TIMESTAMP(3) NOT NULL,"consumedAt" TIMESTAMP(3),"createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "security_challenges_userId_purpose_createdAt_idx" ON security_challenges("userId",purpose,"createdAt");
CREATE TABLE step_up_proofs (
 id TEXT PRIMARY KEY,"userId" TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
 "tokenHash" TEXT NOT NULL UNIQUE,action TEXT NOT NULL,binding TEXT NOT NULL,"authVersion" INTEGER NOT NULL,
 "expiresAt" TIMESTAMP(3) NOT NULL,"consumedAt" TIMESTAMP(3),"createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE security_deliveries (
 id TEXT PRIMARY KEY REFERENCES security_challenges(id) ON DELETE RESTRICT,
 channel TEXT NOT NULL CHECK(channel IN ('EMAIL','SMS')),recipient TEXT NOT NULL,payload TEXT,
 status TEXT NOT NULL DEFAULT 'PENDING' CHECK(status IN ('PENDING','TEST','SENT','FAILED','EXPIRED')),
 attempts INTEGER NOT NULL DEFAULT 0,"nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,"lockedUntil" TIMESTAMP(3),
 "expiresAt" TIMESTAMP(3) NOT NULL,"createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "security_deliveries_status_nextAttemptAt_idx" ON security_deliveries(status,"nextAttemptAt");
CREATE FUNCTION security_challenge_protect() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF (NEW.id,NEW."userId",NEW.purpose,NEW.target,NEW."codeHash",NEW."authVersion",NEW.binding,NEW.action,NEW."expiresAt") IS DISTINCT FROM (OLD.id,OLD."userId",OLD.purpose,OLD.target,OLD."codeHash",OLD."authVersion",OLD.binding,OLD.action,OLD."expiresAt") OR NEW.attempts<OLD.attempts OR (OLD."consumedAt" IS NOT NULL AND NEW."consumedAt" IS DISTINCT FROM OLD."consumedAt") THEN RAISE EXCEPTION 'Security challenges are immutable and single-use' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER security_challenge_protect BEFORE UPDATE ON security_challenges FOR EACH ROW EXECUTE FUNCTION security_challenge_protect();
CREATE FUNCTION step_up_proof_protect() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF (NEW.id,NEW."userId",NEW."tokenHash",NEW.action,NEW.binding,NEW."authVersion",NEW."expiresAt") IS DISTINCT FROM (OLD.id,OLD."userId",OLD."tokenHash",OLD.action,OLD.binding,OLD."authVersion",OLD."expiresAt") OR (OLD."consumedAt" IS NOT NULL AND NEW."consumedAt" IS DISTINCT FROM OLD."consumedAt") THEN RAISE EXCEPTION 'Step-up proofs are immutable and single-use' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER step_up_proof_protect BEFORE UPDATE ON step_up_proofs FOR EACH ROW EXECUTE FUNCTION step_up_proof_protect();
COMMIT;

