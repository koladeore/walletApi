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
