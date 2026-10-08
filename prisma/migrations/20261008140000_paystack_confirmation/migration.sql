BEGIN;
ALTER TABLE funding_requests ADD COLUMN "providerTransactionId" TEXT;
ALTER TABLE funding_requests ADD COLUMN "verifiedAt" TIMESTAMP(3);
ALTER TABLE funding_requests ADD COLUMN "lastCheckedAt" TIMESTAMP(3);
CREATE UNIQUE INDEX "funding_requests_providerTransactionId_key" ON funding_requests("providerTransactionId");
CREATE TABLE paystack_events (
  id TEXT PRIMARY KEY,
  "eventType" TEXT NOT NULL,
  reference TEXT,
  payment JSONB NOT NULL,
  status TEXT NOT NULL DEFAULT 'RECEIVED' CHECK (status IN ('RECEIVED','PROCESSED','REJECTED','IGNORED')),
  attempts INTEGER NOT NULL DEFAULT 0,
  "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lockedUntil" TIMESTAMP(3),
  "lastError" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "processedAt" TIMESTAMP(3)
);
CREATE INDEX "paystack_events_status_nextAttemptAt_idx" ON paystack_events(status,"nextAttemptAt");

-- Expected details and completed confirmations cannot be rewritten after capture.
CREATE FUNCTION funding_details_protect() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Funding requests must be retained' USING ERRCODE='23514'; END IF;
 IF (NEW.id, NEW.reference, NEW."idempotencyKey", NEW."userId", NEW."walletId", NEW."expectedEmail", NEW."amountMinor", NEW.currency, NEW.provider, NEW."providerMode")
   IS DISTINCT FROM
    (OLD.id, OLD.reference, OLD."idempotencyKey", OLD."userId", OLD."walletId", OLD."expectedEmail", OLD."amountMinor", OLD.currency, OLD.provider, OLD."providerMode") THEN
  RAISE EXCEPTION 'Expected funding details are immutable' USING ERRCODE='23514';
 END IF;
 IF OLD.status='SUCCESS' AND (NEW.status, NEW."providerTransactionId", NEW."verifiedAt") IS DISTINCT FROM (OLD.status, OLD."providerTransactionId", OLD."verifiedAt") THEN
  RAISE EXCEPTION 'Successful funding confirmation is immutable' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER funding_details_protect BEFORE UPDATE OR DELETE ON funding_requests FOR EACH ROW EXECUTE FUNCTION funding_details_protect();

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
      OR original.type='DEBIT' OR original.metadata->>'fundingSource'='PAYSTACK' OR original.currency<>NEW.currency OR original."amountMinor"<>NEW."amountMinor"
      OR NEW.status<>'SUCCESS' OR NEW."senderWalletId" IS DISTINCT FROM original."receiverWalletId"
      OR NEW."receiverWalletId" IS DISTINCT FROM original."senderWalletId"
      OR NEW.type::text <> (CASE WHEN original.type='TRANSFER' THEN 'TRANSFER' ELSE 'DEBIT' END) THEN
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

CREATE FUNCTION funding_success_posted() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE current_request funding_requests;
BEGIN
 SELECT * INTO current_request FROM funding_requests WHERE id=NEW.id;
 IF current_request.status='SUCCESS' AND NOT EXISTS (
   SELECT 1 FROM transactions t JOIN ledger_journals j ON j."transactionId"=t.id
    WHERE t.id='funding:'||current_request.id AND t.status='SUCCESS'
     AND t."referenceId"='paystack:'||current_request.reference
     AND t."receiverWalletId"=current_request."walletId"
     AND t."amountMinor"=current_request."amountMinor" AND t.currency=current_request.currency
 ) THEN
  RAISE EXCEPTION 'Successful funding requires an atomic ledger posting' USING ERRCODE='23514';
 END IF;
 RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER funding_success_posted AFTER INSERT OR UPDATE ON funding_requests
 DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION funding_success_posted();

COMMIT;
