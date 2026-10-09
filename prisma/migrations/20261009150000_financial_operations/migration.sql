BEGIN;
ALTER TABLE wallets ADD COLUMN "outgoingFrozen" BOOLEAN NOT NULL DEFAULT false;
CREATE TABLE reconciliation_runs (id TEXT PRIMARY KEY,status TEXT NOT NULL DEFAULT 'RUNNING',"startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,"completedAt" TIMESTAMP(3),summary JSONB);
CREATE TABLE reconciliation_issues (id TEXT PRIMARY KEY,key TEXT NOT NULL UNIQUE,kind TEXT NOT NULL,reference TEXT,details JSONB NOT NULL,status TEXT NOT NULL DEFAULT 'OPEN',"firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,"lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,"resolvedAt" TIMESTAMP(3),resolution TEXT);
CREATE INDEX "reconciliation_issues_status_lastSeenAt_idx" ON reconciliation_issues(status,"lastSeenAt");
CREATE TABLE reconciliation_leases (id TEXT PRIMARY KEY,"lockedUntil" TIMESTAMP(3) NOT NULL);
CREATE TABLE financial_cases (id TEXT PRIMARY KEY,kind TEXT NOT NULL CHECK(kind IN ('REFUND','DISPUTE')),"providerId" TEXT NOT NULL,"fundingId" TEXT NOT NULL REFERENCES funding_requests(id) ON DELETE RESTRICT,reference TEXT NOT NULL,"walletId" TEXT NOT NULL REFERENCES wallets(id) ON DELETE RESTRICT,"providerStatus" TEXT NOT NULL,"amountMinor" BIGINT NOT NULL CHECK("amountMinor">=0),"recoveredMinor" BIGINT NOT NULL DEFAULT 0,"shortfallMinor" BIGINT NOT NULL DEFAULT 0,applied BOOLEAN NOT NULL DEFAULT false,"nextCheckAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,"createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,"updatedAt" TIMESTAMP(3) NOT NULL,
 CONSTRAINT case_amounts CHECK("recoveredMinor">=0 AND "shortfallMinor">=0 AND (NOT applied OR "amountMinor"="recoveredMinor"+"shortfallMinor")));
CREATE UNIQUE INDEX "financial_cases_kind_providerId_key" ON financial_cases(kind,"providerId");
CREATE INDEX "financial_cases_nextCheckAt_idx" ON financial_cases("nextCheckAt");
CREATE TABLE provider_fees (id TEXT PRIMARY KEY,reference TEXT NOT NULL,kind TEXT NOT NULL CHECK(kind IN ('FUNDING','PAYOUT')),"amountMinor" BIGINT NOT NULL CHECK("amountMinor">=0),"createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE FUNCTION financial_case_protect() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Financial cases must be retained' USING ERRCODE='23514'; END IF;
 IF (NEW.id,NEW.kind,NEW."providerId",NEW."fundingId",NEW.reference,NEW."walletId") IS DISTINCT FROM (OLD.id,OLD.kind,OLD."providerId",OLD."fundingId",OLD.reference,OLD."walletId") OR (OLD.applied AND (NOT NEW.applied OR (NEW."amountMinor",NEW."recoveredMinor",NEW."shortfallMinor") IS DISTINCT FROM (OLD."amountMinor",OLD."recoveredMinor",OLD."shortfallMinor"))) THEN RAISE EXCEPTION 'Applied cases are immutable' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER financial_case_protect BEFORE UPDATE OR DELETE ON financial_cases FOR EACH ROW EXECUTE FUNCTION financial_case_protect();
CREATE TRIGGER provider_fees_immutable BEFORE UPDATE OR DELETE ON provider_fees FOR EACH ROW EXECUTE FUNCTION ledger_immutable();
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
  ELSIF NEW.type='DEBIT' AND EXISTS(SELECT 1 FROM financial_cases c WHERE c.id=NEW.metadata->>'financialCaseId' AND c.applied AND c."recoveredMinor"=NEW."amountMinor" AND c."walletId"=NEW."senderWalletId" AND NEW."receiverWalletId" IS NULL AND NEW.id='case:'||c.id AND NEW."referenceId"='case:'||c.id) THEN
    debit_account := 'wallet:'||NEW."senderWalletId";
    credit_account := 'system:NGN:CLEARING';
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


-- Outgoing wallet movements must stop under investigation. Verified recoveries have their own boundary.
CREATE FUNCTION wallet_frozen_boundary() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF OLD."outgoingFrozen" AND (NEW."reservedMinor">OLD."reservedMinor" OR NEW."balanceMinor"<OLD."balanceMinor") AND NOT (OLD."reservedMinor"-NEW."reservedMinor"=OLD."balanceMinor"-NEW."balanceMinor" AND OLD."balanceMinor">NEW."balanceMinor" AND EXISTS(SELECT 1 FROM withdrawal_reservations r WHERE r."walletId"=NEW.id AND r.status='CAPTURED' AND r."amountMinor"=OLD."balanceMinor"-NEW."balanceMinor")) AND NOT EXISTS(SELECT 1 FROM financial_cases c WHERE c."walletId"=NEW.id AND c.applied AND c."recoveredMinor"=OLD."balanceMinor"-NEW."balanceMinor" AND EXISTS(SELECT 1 FROM ledger_journals j WHERE j."transactionId"='case:'||c.id AND j."createdXid"=txid_current())) THEN RAISE EXCEPTION 'Wallet outgoing money is frozen' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER wallet_frozen_boundary BEFORE UPDATE ON wallets FOR EACH ROW EXECUTE FUNCTION wallet_frozen_boundary();
CREATE FUNCTION case_posted_check() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE c financial_cases;
BEGIN
 SELECT * INTO c FROM financial_cases WHERE id=NEW.id;
 IF c.applied AND c."recoveredMinor">0 AND NOT EXISTS(SELECT 1 FROM transactions t WHERE t.id='case:'||c.id AND t."amountMinor"=c."recoveredMinor" AND t."senderWalletId"=c."walletId" AND t.status='SUCCESS') THEN RAISE EXCEPTION 'Case recovery requires a ledger transaction' USING ERRCODE='23514'; END IF;
 IF c.applied AND c."shortfallMinor">0 AND NOT EXISTS(SELECT 1 FROM ledger_journals j WHERE j.id='case-shortfall:'||c.id) THEN RAISE EXCEPTION 'Shortfall requires a ledger journal' USING ERRCODE='23514'; END IF;
 RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER case_posted_check AFTER INSERT OR UPDATE ON financial_cases DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION case_posted_check();
CREATE FUNCTION fee_posted_check() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW."amountMinor">0 AND (COALESCE((SELECT sum(e."amountMinor") FROM ledger_entries e WHERE e."journalId"='fee:'||NEW.id AND e.side='DEBIT' AND e."accountId"='system:NGN:FEES'),0)<>NEW."amountMinor" OR COALESCE((SELECT sum(e."amountMinor") FROM ledger_entries e WHERE e."journalId"='fee:'||NEW.id AND e.side='CREDIT' AND e."accountId"='system:NGN:CLEARING'),0)<>NEW."amountMinor") THEN RAISE EXCEPTION 'Provider fee requires an atomic expense journal' USING ERRCODE='23514'; END IF;
 RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER fee_posted_check AFTER INSERT ON provider_fees DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION fee_posted_check();
COMMIT;

