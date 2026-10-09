BEGIN;
CREATE TYPE "PayoutStatus" AS ENUM ('PENDING','PROCESSING','SUCCESS','FAILED','REVERSED');
CREATE TABLE payouts (
 id TEXT PRIMARY KEY, reference TEXT NOT NULL UNIQUE, "idempotencyKey" TEXT NOT NULL,
 "userId" TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
 "walletId" TEXT NOT NULL REFERENCES wallets(id) ON DELETE RESTRICT,
 "beneficiaryId" TEXT NOT NULL REFERENCES beneficiaries(id) ON DELETE RESTRICT,
 "reservationId" TEXT NOT NULL UNIQUE REFERENCES withdrawal_reservations(id) ON DELETE RESTRICT,
 "amountMinor" BIGINT NOT NULL CHECK ("amountMinor">0 AND "amountMinor"<=9007199254740991),
 currency TEXT NOT NULL DEFAULT 'NGN' CHECK(currency='NGN'),
 "providerMode" TEXT NOT NULL DEFAULT 'test' CHECK("providerMode"='test'),
 "bankCode" TEXT NOT NULL, "accountNumber" TEXT NOT NULL, "accountName" TEXT NOT NULL,
 "recipientCode" TEXT, "transferCode" TEXT UNIQUE,
 status "PayoutStatus" NOT NULL DEFAULT 'PENDING', "providerStatus" TEXT,
 uncertain BOOLEAN NOT NULL DEFAULT false, "submittedAt" TIMESTAMP(3), "lockedUntil" TIMESTAMP(3),
 "nextCheckAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "lastError" TEXT,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL
);
CREATE UNIQUE INDEX "payouts_userId_idempotencyKey_key" ON payouts("userId","idempotencyKey");
CREATE INDEX "payouts_status_nextCheckAt_idx" ON payouts(status,"nextCheckAt");
CREATE TRIGGER payouts_no_truncate BEFORE TRUNCATE ON payouts FOR EACH STATEMENT EXECUTE FUNCTION ledger_immutable();
CREATE FUNCTION payout_details_protect() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Payouts must be retained' USING ERRCODE='23514'; END IF;
 IF (NEW.id,NEW.reference,NEW."idempotencyKey",NEW."userId",NEW."walletId",NEW."beneficiaryId",NEW."reservationId",NEW."amountMinor",NEW.currency,NEW."providerMode",NEW."bankCode",NEW."accountNumber",NEW."accountName") IS DISTINCT FROM
 (OLD.id,OLD.reference,OLD."idempotencyKey",OLD."userId",OLD."walletId",OLD."beneficiaryId",OLD."reservationId",OLD."amountMinor",OLD.currency,OLD."providerMode",OLD."bankCode",OLD."accountNumber",OLD."accountName") THEN RAISE EXCEPTION 'Payout expectations are immutable' USING ERRCODE='23514'; END IF;
 IF OLD."submittedAt" IS NOT NULL AND (NEW."submittedAt" IS DISTINCT FROM OLD."submittedAt" OR NEW."recipientCode" IS DISTINCT FROM OLD."recipientCode") THEN RAISE EXCEPTION 'Submitted payout destination is immutable' USING ERRCODE='23514'; END IF;
 IF OLD."transferCode" IS NOT NULL AND NEW."transferCode" IS DISTINCT FROM OLD."transferCode" THEN RAISE EXCEPTION 'Transfer identity is immutable' USING ERRCODE='23514'; END IF;
 IF (OLD.status='SUCCESS' AND NEW.status NOT IN ('SUCCESS','REVERSED')) OR (OLD.status IN ('FAILED','REVERSED') AND NEW.status<>OLD.status) THEN RAISE EXCEPTION 'Invalid terminal payout transition' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER payout_details_protect BEFORE UPDATE OR DELETE ON payouts FOR EACH ROW EXECUTE FUNCTION payout_details_protect();
CREATE OR REPLACE FUNCTION ledger_post_transaction() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE debit_account TEXT; credit_account TEXT; journal_id TEXT; original transactions; original_journal TEXT;
BEGIN
  IF NEW.status <> 'SUCCESS' THEN RETURN NEW; END IF;
  IF TG_OP='UPDATE' AND OLD.status='SUCCESS' THEN RETURN NEW; END IF;
  IF NEW.currency <> 'NGN' THEN RAISE EXCEPTION 'New postings require NGN' USING ERRCODE='23514'; END IF;
  IF NEW."reversalOfId" IS NOT NULL THEN
    SELECT * INTO STRICT original FROM transactions WHERE id=NEW."reversalOfId";
    SELECT id INTO original_journal FROM ledger_journals WHERE "transactionId"=original.id;
    IF original.status<>'SUCCESS' OR original."reversalOfId" IS NOT NULL OR original_journal IS NULL
      OR (original.type='DEBIT' AND NOT EXISTS (SELECT 1 FROM payouts p WHERE p.status='REVERSED' AND original.id='withdrawal:'||p."reservationId" AND NEW.id='payout-reversal:'||p.id AND NEW."referenceId"='payout-reversal:'||p.reference)) OR original.metadata->>'fundingSource'='PAYSTACK' OR original.currency<>NEW.currency OR original."amountMinor"<>NEW."amountMinor"
      OR NEW.status<>'SUCCESS' OR NEW."senderWalletId" IS DISTINCT FROM original."receiverWalletId"
      OR NEW."receiverWalletId" IS DISTINCT FROM original."senderWalletId"
      OR NEW.type::text <> (CASE WHEN original.type='TRANSFER' THEN 'TRANSFER' WHEN original.type='DEBIT' THEN 'CREDIT' ELSE 'DEBIT' END) THEN
      RAISE EXCEPTION 'Invalid full internal reversal' USING ERRCODE='23514';
    END IF;
    journal_id:='transaction:'||NEW.id;
    INSERT INTO ledger_journals(id,reference,currency,description,"transactionId")
      VALUES(journal_id,'transaction:'||NEW."referenceId",NEW.currency,'Reversal of '||original.id,NEW.id);
    INSERT INTO ledger_entries(id,"journalId","accountId",side,"amountMinor")
      SELECT journal_id||':'||id,journal_id,"accountId",CASE WHEN side='DEBIT' THEN 'CREDIT'::"LedgerSide" ELSE 'DEBIT'::"LedgerSide" END,"amountMinor"
      FROM ledger_entries WHERE "journalId"=original_journal;
    RETURN NEW;
  END IF;
  IF NEW.type='TRANSFER' THEN
    IF NEW."senderWalletId" IS NULL OR NEW."receiverWalletId" IS NULL OR NEW."senderWalletId"=NEW."receiverWalletId" THEN
      RAISE EXCEPTION 'Transfer requires distinct wallets' USING ERRCODE='23514';
    END IF;
    debit_account := 'wallet:' || NEW."senderWalletId";
    credit_account := 'wallet:' || NEW."receiverWalletId";
  ELSIF NEW.type='CREDIT' AND NEW.metadata->>'fundingSource'='SIMULATION' THEN
    IF NEW."receiverWalletId" IS NULL OR NEW."senderWalletId" IS NOT NULL THEN RAISE EXCEPTION 'Invalid funding wallets' USING ERRCODE='23514'; END IF;
    debit_account := 'system:NGN:SIMULATION_CLEARING';
    credit_account := 'wallet:' || NEW."receiverWalletId";
  ELSIF NEW.type='CREDIT' AND NEW.metadata->>'fundingSource'='PAYSTACK' AND EXISTS (
    SELECT 1 FROM funding_requests f WHERE f.id=NEW.metadata->>'fundingRequestId'
      AND f.status='SUCCESS' AND f.provider='PAYSTACK' AND f."providerMode"='test'
      AND f."verifiedAt" IS NOT NULL AND f."providerTransactionId" IS NOT NULL
      AND f."providerTransactionId"=NEW.metadata->>'providerTransactionId'
      AND f."walletId"=NEW."receiverWalletId" AND f."amountMinor"=NEW."amountMinor"
      AND f.currency=NEW.currency AND NEW."senderWalletId" IS NULL
      AND NEW.id='funding:'||f.id AND NEW."referenceId"='paystack:'||f.reference
  ) THEN
    debit_account := 'system:NGN:CLEARING';
    credit_account := 'wallet:' || NEW."receiverWalletId";
  ELSIF NEW.type='DEBIT' AND EXISTS (
    SELECT 1 FROM withdrawal_reservations r WHERE r.id=NEW.metadata->>'withdrawalReservationId'
      AND r.status='CAPTURED' AND r."walletId"=NEW."senderWalletId"
      AND r."amountMinor"=NEW."amountMinor" AND r.currency=NEW.currency
      AND NEW.id='withdrawal:'||r.id AND NEW."referenceId"='withdrawal:'||r.id
      AND NEW."receiverWalletId" IS NULL
  ) THEN
    debit_account := 'wallet:' || NEW."senderWalletId";
    credit_account := 'system:NGN:CLEARING';
  ELSE
    RAISE EXCEPTION 'Unsupported posting source; implement verified payment or withdrawal posting first' USING ERRCODE='23514';
  END IF;
  journal_id := 'transaction:' || NEW.id;
  INSERT INTO ledger_journals(id, reference, currency, description, "transactionId")
    VALUES (journal_id, 'transaction:' || NEW."referenceId", NEW.currency, NEW.type::text, NEW.id);
  INSERT INTO ledger_entries(id, "journalId", "accountId", side, "amountMinor") VALUES
    (journal_id || ':debit', journal_id, debit_account, 'DEBIT', NEW."amountMinor"),
    (journal_id || ':credit', journal_id, credit_account, 'CREDIT', NEW."amountMinor");
  RETURN NEW;
END $$;

CREATE FUNCTION payout_consistency() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE p payouts; r withdrawal_reservations;
BEGIN
 IF TG_TABLE_NAME='payouts' THEN SELECT * INTO p FROM payouts WHERE id=NEW.id;
 ELSE SELECT * INTO p FROM payouts WHERE "reservationId"=NEW.id; END IF;
 IF NOT FOUND THEN RETURN NULL; END IF;
 SELECT * INTO STRICT r FROM withdrawal_reservations WHERE id=p."reservationId";
 IF r."walletId"<>p."walletId" OR r.currency<>p.currency OR r."amountMinor"<>p."amountMinor" OR r.reference<>p.reference THEN RAISE EXCEPTION 'Payout reservation mismatch' USING ERRCODE='23514'; END IF;
 IF (p.status IN ('PENDING','PROCESSING') AND r.status<>'PENDING') OR (p.status='SUCCESS' AND r.status<>'CAPTURED') OR (p.status='FAILED' AND r.status<>'RELEASED') OR (p.status='REVERSED' AND r.status NOT IN ('CAPTURED','RELEASED')) THEN RAISE EXCEPTION 'Payout balance state mismatch' USING ERRCODE='23514'; END IF;
 IF p.status='REVERSED' AND r.status='CAPTURED' AND NOT EXISTS(SELECT 1 FROM transactions t WHERE t.id='payout-reversal:'||p.id AND t."reversalOfId"='withdrawal:'||r.id AND t.status='SUCCESS') THEN RAISE EXCEPTION 'Reversed captured payout requires credit' USING ERRCODE='23514'; END IF;
 RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER payout_consistency AFTER INSERT OR UPDATE ON payouts DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION payout_consistency();
CREATE CONSTRAINT TRIGGER payout_reservation_consistency AFTER UPDATE ON withdrawal_reservations DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION payout_consistency();
COMMIT;
