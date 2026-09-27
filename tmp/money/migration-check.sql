CREATE TABLE wallets (id TEXT PRIMARY KEY, balance NUMERIC(20,2) NOT NULL DEFAULT 0, currency TEXT NOT NULL DEFAULT 'USD');
CREATE TABLE transactions (id TEXT PRIMARY KEY, amount NUMERIC(20,2) NOT NULL, "senderWalletId" TEXT, "receiverWalletId" TEXT);
INSERT INTO wallets VALUES ('ngn', 90071992547409.93, 'NGN'), ('usd', 100.50, 'USD');
INSERT INTO transactions VALUES ('tx', 0.01, NULL, 'ngn');
BEGIN;
-- Preserve historical currency labels. This is a unit conversion, never foreign exchange.
-- Abort rather than lose data on unsupported precision, currency ambiguity, or overflow.
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM wallets WHERE balance < 0 OR balance * 100 > 9223372036854775807) THEN
    RAISE EXCEPTION 'Wallet balance outside supported integer money range';
  END IF;
  IF EXISTS (SELECT 1 FROM transactions WHERE amount <= 0 OR amount * 100 > 9223372036854775807) THEN
    RAISE EXCEPTION 'Transaction amount outside supported integer money range';
  END IF;
  IF EXISTS (SELECT 1 FROM transactions t
    LEFT JOIN wallets s ON s.id = t."senderWalletId"
    LEFT JOIN wallets r ON r.id = t."receiverWalletId"
    WHERE COALESCE(s.currency, r.currency) IS NULL
      OR (s.currency IS NOT NULL AND r.currency IS NOT NULL AND s.currency <> r.currency)) THEN
    RAISE EXCEPTION 'Transaction currency cannot be determined safely';
  END IF;
  IF EXISTS (SELECT 1 FROM wallets WHERE currency NOT IN ('NGN', 'USD')) THEN
    RAISE EXCEPTION 'Review currency minor unit precision before migration';
  END IF;
END $$;
ALTER TABLE transactions ADD COLUMN currency TEXT;
UPDATE transactions t SET currency = COALESCE(
  (SELECT currency FROM wallets WHERE id = t."senderWalletId"),
  (SELECT currency FROM wallets WHERE id = t."receiverWalletId")
);
ALTER TABLE transactions ALTER COLUMN currency SET NOT NULL;
ALTER TABLE wallets ALTER COLUMN balance DROP DEFAULT;
ALTER TABLE wallets ALTER COLUMN balance TYPE BIGINT USING (balance * 100)::BIGINT;
ALTER TABLE wallets RENAME COLUMN balance TO "balanceMinor";
ALTER TABLE wallets ALTER COLUMN "balanceMinor" SET DEFAULT 0;
ALTER TABLE wallets ALTER COLUMN currency SET DEFAULT 'NGN';
ALTER TABLE transactions ALTER COLUMN amount TYPE BIGINT USING (amount * 100)::BIGINT;
ALTER TABLE transactions RENAME COLUMN amount TO "amountMinor";
ALTER TABLE wallets ADD CONSTRAINT wallets_nonnegative_balance CHECK ("balanceMinor" >= 0);
ALTER TABLE transactions ADD CONSTRAINT transactions_positive_amount CHECK ("amountMinor" > 0);
COMMIT;
DO $$ BEGIN
 IF (SELECT "balanceMinor" FROM wallets WHERE id = 'ngn') <> 9007199254740993 THEN RAISE EXCEPTION 'Precision lost'; END IF;
 IF (SELECT "balanceMinor" FROM wallets WHERE id = 'usd') <> 10050 OR (SELECT currency FROM wallets WHERE id = 'usd') <> 'USD' THEN RAISE EXCEPTION 'Historical currency changed'; END IF;
 IF (SELECT "amountMinor" FROM transactions WHERE id = 'tx') <> 1 OR (SELECT currency FROM transactions WHERE id = 'tx') <> 'NGN' THEN RAISE EXCEPTION 'Transaction conversion failed'; END IF;
 BEGIN
  UPDATE wallets SET "balanceMinor" = -1 WHERE id = 'ngn';
  RAISE EXCEPTION 'Negative balance accepted';
 EXCEPTION WHEN check_violation THEN NULL;
 END;
END $$;
SELECT 'Money migration and precision checks passed' AS result;
