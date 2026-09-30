BEGIN;
LOCK TABLE wallets, transactions IN ACCESS EXCLUSIVE MODE;
CREATE TYPE "LedgerAccountKind" AS ENUM ('CUSTOMER', 'CLEARING', 'SIMULATION_CLEARING', 'FEES', 'ADJUSTMENTS');
CREATE TYPE "LedgerSide" AS ENUM ('DEBIT', 'CREDIT');
CREATE TABLE ledger_accounts (
  id TEXT PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  currency TEXT NOT NULL,
  kind "LedgerAccountKind" NOT NULL,
  "walletId" TEXT UNIQUE REFERENCES wallets(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT ledger_customer_wallet CHECK ((kind = 'CUSTOMER') = ("walletId" IS NOT NULL))
);
CREATE TABLE ledger_journals (
  id TEXT PRIMARY KEY,
  reference TEXT NOT NULL UNIQUE,
  currency TEXT NOT NULL,
  description TEXT NOT NULL,
  "transactionId" TEXT UNIQUE REFERENCES transactions(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdXid" BIGINT NOT NULL DEFAULT txid_current()
);
CREATE TABLE ledger_entries (
  id TEXT PRIMARY KEY,
  "journalId" TEXT NOT NULL REFERENCES ledger_journals(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  "accountId" TEXT NOT NULL REFERENCES ledger_accounts(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  side "LedgerSide" NOT NULL,
  "amountMinor" BIGINT NOT NULL CHECK ("amountMinor" > 0),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "ledger_entries_accountId_createdAt_idx" ON ledger_entries("accountId", "createdAt");
CREATE INDEX "ledger_entries_journalId_idx" ON ledger_entries("journalId");

CREATE FUNCTION ledger_system_accounts(c TEXT) RETURNS void LANGUAGE plpgsql AS $$
DECLARE k "LedgerAccountKind";
BEGIN
  FOREACH k IN ARRAY ARRAY['CLEARING','SIMULATION_CLEARING','FEES','ADJUSTMENTS']::"LedgerAccountKind"[] LOOP
    INSERT INTO ledger_accounts(id, code, currency, kind)
      VALUES ('system:' || c || ':' || k, 'system:' || c || ':' || k, c, k)
      ON CONFLICT (code) DO NOTHING;
  END LOOP;
END $$;
SELECT ledger_system_accounts('NGN');
SELECT ledger_system_accounts(currency) FROM (SELECT DISTINCT currency FROM wallets) currencies;
INSERT INTO ledger_accounts(id, code, currency, kind, "walletId")
  SELECT 'wallet:' || id, 'wallet:' || id, currency, 'CUSTOMER', id FROM wallets;

-- Migration cutoff: opening balances, not invented historical payment receipts.
INSERT INTO ledger_journals(id, reference, currency, description)
  SELECT 'opening:' || id, 'opening:' || id, currency,
    'Opening balance at ledger migration; historical source not reconstructed'
  FROM wallets WHERE "balanceMinor" > 0;
INSERT INTO ledger_entries(id, "journalId", "accountId", side, "amountMinor")
  SELECT 'opening:debit:' || id, 'opening:' || id, 'system:' || currency || ':ADJUSTMENTS', 'DEBIT', "balanceMinor"
  FROM wallets WHERE "balanceMinor" > 0;
INSERT INTO ledger_entries(id, "journalId", "accountId", side, "amountMinor")
  SELECT 'opening:credit:' || id, 'opening:' || id, 'wallet:' || id, 'CREDIT', "balanceMinor"
  FROM wallets WHERE "balanceMinor" > 0;

CREATE FUNCTION ledger_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Posted ledger records are immutable; use a compensating journal' USING ERRCODE = '23514'; END $$;
CREATE TRIGGER ledger_accounts_immutable BEFORE UPDATE OR DELETE ON ledger_accounts FOR EACH ROW EXECUTE FUNCTION ledger_immutable();
CREATE TRIGGER ledger_journals_immutable BEFORE UPDATE OR DELETE ON ledger_journals FOR EACH ROW EXECUTE FUNCTION ledger_immutable();
CREATE TRIGGER ledger_entries_immutable BEFORE UPDATE OR DELETE ON ledger_entries FOR EACH ROW EXECUTE FUNCTION ledger_immutable();
CREATE TRIGGER ledger_accounts_no_truncate BEFORE TRUNCATE ON ledger_accounts FOR EACH STATEMENT EXECUTE FUNCTION ledger_immutable();
CREATE TRIGGER ledger_journals_no_truncate BEFORE TRUNCATE ON ledger_journals FOR EACH STATEMENT EXECUTE FUNCTION ledger_immutable();
CREATE TRIGGER ledger_entries_no_truncate BEFORE TRUNCATE ON ledger_entries FOR EACH STATEMENT EXECUTE FUNCTION ledger_immutable();

CREATE FUNCTION ledger_account_currency() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.currency NOT IN ('NGN', 'USD') THEN RAISE EXCEPTION 'Unsupported ledger currency' USING ERRCODE='23514'; END IF;
  IF NEW."walletId" IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM wallets WHERE id=NEW."walletId" AND currency=NEW.currency
  ) THEN RAISE EXCEPTION 'Account and wallet currency mismatch' USING ERRCODE='23514'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER ledger_account_currency BEFORE INSERT ON ledger_accounts FOR EACH ROW EXECUTE FUNCTION ledger_account_currency();

CREATE FUNCTION ledger_journal_insert() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW."createdXid" := txid_current();
  RETURN NEW;
END $$;
CREATE TRIGGER ledger_journal_insert BEFORE INSERT ON ledger_journals FOR EACH ROW EXECUTE FUNCTION ledger_journal_insert();

CREATE FUNCTION ledger_entry_insert() RETURNS trigger LANGUAGE plpgsql AS $$
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
  RETURN NEW;
END $$;
CREATE TRIGGER ledger_entry_insert BEFORE INSERT ON ledger_entries FOR EACH ROW EXECUTE FUNCTION ledger_entry_insert();

CREATE FUNCTION ledger_balanced() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE n BIGINT; total NUMERIC; j TEXT;
BEGIN
  IF TG_TABLE_NAME='ledger_journals' THEN j := NEW.id; ELSE j := NEW."journalId"; END IF;
  SELECT count(*), sum(CASE WHEN side='DEBIT' THEN "amountMinor"::numeric ELSE -"amountMinor"::numeric END)
    INTO n, total FROM ledger_entries WHERE "journalId"=j;
  IF n < 2 OR total <> 0 THEN RAISE EXCEPTION 'Journal must contain balanced debits and credits' USING ERRCODE='23514'; END IF;
  RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER ledger_balanced AFTER INSERT ON ledger_journals
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION ledger_balanced();
CREATE CONSTRAINT TRIGGER ledger_entries_balanced AFTER INSERT ON ledger_entries
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION ledger_balanced();

CREATE FUNCTION ledger_assert_wallet(w TEXT) RETURNS void LANGUAGE plpgsql AS $$
DECLARE actual BIGINT; expected NUMERIC;
BEGIN
  SELECT "balanceMinor" INTO actual FROM wallets WHERE id=w;
  SELECT COALESCE(sum(CASE WHEN e.side='CREDIT' THEN e."amountMinor"::numeric ELSE -e."amountMinor"::numeric END),0)
    INTO expected FROM ledger_accounts a LEFT JOIN ledger_entries e ON e."accountId"=a.id WHERE a."walletId"=w;
  IF actual IS DISTINCT FROM expected THEN RAISE EXCEPTION 'Wallet balance must equal customer ledger balance' USING ERRCODE='23514'; END IF;
END $$;
CREATE FUNCTION ledger_wallet_check() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN PERFORM ledger_assert_wallet(NEW.id); RETURN NULL; END $$;
CREATE CONSTRAINT TRIGGER ledger_wallet_check AFTER INSERT OR UPDATE ON wallets
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION ledger_wallet_check();
CREATE FUNCTION ledger_entry_wallet_check() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE w TEXT;
BEGIN
  SELECT "walletId" INTO w FROM ledger_accounts WHERE id=NEW."accountId";
  IF w IS NOT NULL THEN PERFORM ledger_assert_wallet(w); END IF;
  RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER ledger_entry_wallet_check AFTER INSERT ON ledger_entries
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION ledger_entry_wallet_check();

CREATE FUNCTION ledger_new_wallet() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  PERFORM ledger_system_accounts(NEW.currency);
  INSERT INTO ledger_accounts(id, code, currency, kind, "walletId")
    VALUES ('wallet:' || NEW.id, 'wallet:' || NEW.id, NEW.currency, 'CUSTOMER', NEW.id);
  RETURN NEW;
END $$;
CREATE TRIGGER ledger_new_wallet AFTER INSERT ON wallets FOR EACH ROW EXECUTE FUNCTION ledger_new_wallet();
CREATE FUNCTION ledger_wallet_identity() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.id <> OLD.id OR NEW.currency <> OLD.currency OR NEW."userId" <> OLD."userId" THEN
    RAISE EXCEPTION 'Wallet identity and currency are immutable' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER ledger_wallet_identity BEFORE UPDATE ON wallets FOR EACH ROW EXECUTE FUNCTION ledger_wallet_identity();

CREATE FUNCTION ledger_post_transaction() RETURNS trigger LANGUAGE plpgsql AS $$
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
CREATE TRIGGER ledger_post_transaction AFTER INSERT OR UPDATE ON transactions FOR EACH ROW EXECUTE FUNCTION ledger_post_transaction();
CREATE FUNCTION ledger_protect_transaction() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.status='SUCCESS' THEN RAISE EXCEPTION 'Successful financial transactions are immutable' USING ERRCODE='23514'; END IF;
  IF TG_OP='DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER ledger_protect_transaction BEFORE UPDATE OR DELETE ON transactions FOR EACH ROW EXECUTE FUNCTION ledger_protect_transaction();
-- Verify migrated customer balances before completing the cutoff.
SELECT ledger_assert_wallet(id) FROM wallets;
COMMIT;
