ALTER TABLE notifications ADD COLUMN "emailBatchAttempts" INTEGER NOT NULL DEFAULT 0,
 ADD COLUMN "emailRecoveryCount" INTEGER NOT NULL DEFAULT 0,
 ADD COLUMN "emailLastError" TEXT,
 ADD COLUMN "emailSender" TEXT,
 ADD COLUMN "emailFirstAttemptAt" TIMESTAMP(3);
UPDATE notifications SET "emailBatchAttempts"="emailAttempts";
-- Existing attempted deliveries lack a sender snapshot; don't risk replaying changed content.
UPDATE notifications SET "emailStatus"='SKIPPED',"emailLastError"='LEGACY_DELIVERY_REVIEW_REQUIRED',"emailLockedUntil"=NULL
 WHERE "emailAttempts">0 AND "emailStatus" IN ('PENDING','FAILED','SKIPPED');
CREATE INDEX idx_notifications_delivery_status_date ON notifications("emailStatus","createdAt",id);
