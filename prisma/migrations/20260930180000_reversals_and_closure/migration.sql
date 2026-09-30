BEGIN;
ALTER TABLE users ADD COLUMN "closedAt" TIMESTAMP(3);
ALTER TABLE wallets ADD COLUMN "closedAt" TIMESTAMP(3);
ALTER TABLE wallets DROP CONSTRAINT "wallets_userId_fkey";
ALTER TABLE wallets ADD CONSTRAINT "wallets_userId_fkey" FOREIGN KEY ("userId") REFERENCES users(id) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE transactions ADD COLUMN "reversalOfId" TEXT UNIQUE REFERENCES transactions(id) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE transactions ADD CONSTRAINT reversal_success_only CHECK ("reversalOfId" IS NULL OR status='SUCCESS');
CREATE FUNCTION wallet_open_owner() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE closed TIMESTAMP;
BEGIN
 SELECT "closedAt" INTO closed FROM users WHERE id=NEW."userId" FOR SHARE;
 IF closed IS NOT NULL THEN RAISE EXCEPTION 'Cannot create wallet for closed account' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER wallet_open_owner BEFORE INSERT ON wallets FOR EACH ROW EXECUTE FUNCTION wallet_open_owner();
CREATE FUNCTION closed_wallet_protect() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF OLD."closedAt" IS NOT NULL AND (NEW."closedAt" IS DISTINCT FROM OLD."closedAt" OR NEW."balanceMinor"<>OLD."balanceMinor" OR NEW."reservedMinor"<>OLD."reservedMinor") THEN
  RAISE EXCEPTION 'Closed wallet is immutable' USING ERRCODE='23514';
 END IF;
 IF NEW."closedAt" IS NOT NULL AND (NEW."balanceMinor"<>0 OR NEW."reservedMinor"<>0) THEN
  RAISE EXCEPTION 'Closure requires zero balance and no reservations' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER closed_wallet_protect BEFORE UPDATE ON wallets FOR EACH ROW EXECUTE FUNCTION closed_wallet_protect();
CREATE TRIGGER wallets_preserve BEFORE DELETE ON wallets FOR EACH ROW EXECUTE FUNCTION ledger_immutable();
CREATE TRIGGER users_preserve BEFORE DELETE ON users FOR EACH ROW EXECUTE FUNCTION ledger_immutable();
CREATE FUNCTION close_user_account() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF OLD."closedAt" IS NOT NULL AND (NEW."closedAt" IS DISTINCT FROM OLD."closedAt" OR NEW."isActive") THEN
  RAISE EXCEPTION 'Closed account cannot be reactivated' USING ERRCODE='23514';
 END IF;
 IF OLD."closedAt" IS NULL AND NEW."closedAt" IS NOT NULL THEN
  -- Wallet row lock serializes closure with all monetary operations.
  UPDATE wallets SET "closedAt"=NEW."closedAt", "updatedAt"=now() WHERE "userId"=NEW.id;
  NEW."isActive":=false;
  NEW."authVersion":=OLD."authVersion"+1;
  UPDATE auth_tokens SET "isRevoked"=true WHERE "userId"=NEW.id;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER close_user_account BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION close_user_account();
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
      OR original.type='DEBIT' OR original.currency<>NEW.currency OR original."amountMinor"<>NEW."amountMinor"
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

CREATE OR REPLACE FUNCTION ledger_entry_insert() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE j ledger_journals; a ledger_accounts;
BEGIN
  SELECT * INTO STRICT j FROM ledger_journals WHERE id=NEW."journalId";
  IF j."createdXid" <> txid_current() THEN
    RAISE EXCEPTION 'Cannot append to a committed journal' USING ERRCODE='23514';
  END IF;
  SELECT * INTO STRICT a FROM ledger_accounts WHERE id=NEW."accountId";
  IF a.currency <> j.currency THEN RAISE EXCEPTION 'Ledger currency mismatch' USING ERRCODE='23514'; END IF;
  -- Serialize customer postings with wallet updates, including manual adjustments.
  IF a."walletId" IS NOT NULL THEN PERFORM id FROM wallets WHERE id=a."walletId" FOR UPDATE; END IF;
  IF a."walletId" IS NOT NULL AND EXISTS(SELECT 1 FROM wallets WHERE id=a."walletId" AND "closedAt" IS NOT NULL) THEN
    RAISE EXCEPTION 'Closed wallets cannot receive ledger postings' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END $$;

COMMIT;
