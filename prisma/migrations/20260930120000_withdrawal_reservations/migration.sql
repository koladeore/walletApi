BEGIN;
LOCK TABLE wallets IN ACCESS EXCLUSIVE MODE;
ALTER TABLE wallets ADD COLUMN "reservedMinor" BIGINT NOT NULL DEFAULT 0,
 ADD CONSTRAINT wallet_reserved_range CHECK ("reservedMinor" >= 0 AND "reservedMinor" <= "balanceMinor");
CREATE TYPE "ReservationStatus" AS ENUM ('PENDING', 'RELEASED', 'CAPTURED');
CREATE TABLE withdrawal_reservations (
 id TEXT PRIMARY KEY, reference TEXT NOT NULL UNIQUE,
 "walletId" TEXT NOT NULL REFERENCES wallets(id) ON DELETE RESTRICT ON UPDATE CASCADE,
 currency TEXT NOT NULL CHECK (currency='NGN'),
 "amountMinor" BIGINT NOT NULL CHECK ("amountMinor">0),
 status "ReservationStatus" NOT NULL DEFAULT 'PENDING',
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "updatedAt" TIMESTAMP(3) NOT NULL
);
CREATE INDEX "withdrawal_reservations_walletId_status_idx" ON withdrawal_reservations("walletId",status);
CREATE FUNCTION reservation_transition() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE w wallets;
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Reservations cannot be deleted' USING ERRCODE='23514'; END IF;
 SELECT * INTO STRICT w FROM wallets WHERE id=NEW."walletId" FOR UPDATE;
 IF TG_OP='INSERT' THEN
  IF NEW.status <> 'PENDING' OR NEW.currency <> w.currency OR NEW."amountMinor" > w."balanceMinor"-w."reservedMinor" THEN
   RAISE EXCEPTION 'Invalid reservation or insufficient available balance' USING ERRCODE='23514';
  END IF;
 ELSE
  IF ROW(NEW.id,NEW.reference,NEW."walletId",NEW.currency,NEW."amountMinor",NEW."createdAt") IS DISTINCT FROM
     ROW(OLD.id,OLD.reference,OLD."walletId",OLD.currency,OLD."amountMinor",OLD."createdAt") OR OLD.status <> 'PENDING' OR NEW.status = 'PENDING' THEN
   RAISE EXCEPTION 'Invalid reservation transition' USING ERRCODE='23514';
  END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER reservation_transition BEFORE INSERT OR UPDATE OR DELETE ON withdrawal_reservations FOR EACH ROW EXECUTE FUNCTION reservation_transition();
CREATE TRIGGER reservations_no_truncate BEFORE TRUNCATE ON withdrawal_reservations FOR EACH STATEMENT EXECUTE FUNCTION ledger_immutable();
CREATE FUNCTION reservation_apply() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='INSERT' THEN
  UPDATE wallets SET "reservedMinor"="reservedMinor"+NEW."amountMinor", "updatedAt"=now() WHERE id=NEW."walletId";
 ELSE
  UPDATE wallets SET "reservedMinor"="reservedMinor"-NEW."amountMinor",
   "balanceMinor"="balanceMinor"-CASE WHEN NEW.status='CAPTURED' THEN NEW."amountMinor" ELSE 0 END,
   "updatedAt"=now() WHERE id=NEW."walletId";
  IF NEW.status='CAPTURED' THEN
   INSERT INTO transactions(id,"referenceId","amountMinor",currency,type,status,"senderWalletId",metadata,"updatedAt")
    VALUES ('withdrawal:'||NEW.id,'withdrawal:'||NEW.id,NEW."amountMinor",NEW.currency,'DEBIT','SUCCESS',NEW."walletId",
      jsonb_build_object('withdrawalReservationId',NEW.id),now());
  END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER reservation_apply AFTER INSERT OR UPDATE ON withdrawal_reservations FOR EACH ROW EXECUTE FUNCTION reservation_apply();
CREATE FUNCTION reservation_balance_check() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE w TEXT; actual BIGINT; expected NUMERIC;
BEGIN
 IF TG_TABLE_NAME='wallets' THEN w:=NEW.id; ELSE w:=NEW."walletId"; END IF;
 SELECT "reservedMinor" INTO actual FROM wallets WHERE id=w;
 SELECT COALESCE(sum("amountMinor"::numeric),0) INTO expected FROM withdrawal_reservations WHERE "walletId"=w AND status='PENDING';
 IF actual IS DISTINCT FROM expected THEN RAISE EXCEPTION 'Reserved balance must equal pending reservations' USING ERRCODE='23514'; END IF;
 RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER reservation_wallet_check AFTER INSERT OR UPDATE ON wallets DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION reservation_balance_check();
CREATE CONSTRAINT TRIGGER reservation_record_check AFTER INSERT OR UPDATE ON withdrawal_reservations DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION reservation_balance_check();
CREATE OR REPLACE FUNCTION ledger_post_transaction() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE debit_account TEXT; credit_account TEXT; journal_id TEXT;
BEGIN
  IF NEW.status <> 'SUCCESS' THEN RETURN NEW; END IF;
  IF TG_OP='UPDATE' AND OLD.status='SUCCESS' THEN RETURN NEW; END IF;
  IF NEW.currency <> 'NGN' THEN RAISE EXCEPTION 'New postings require NGN' USING ERRCODE='23514'; END IF;
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

COMMIT;
