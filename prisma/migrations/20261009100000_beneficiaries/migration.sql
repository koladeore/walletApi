CREATE TABLE beneficiaries (
  id TEXT PRIMARY KEY,
  "userId" TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  "bankCode" TEXT NOT NULL,
  "accountNumber" TEXT NOT NULL,
  "accountName" TEXT NOT NULL,
  currency TEXT NOT NULL DEFAULT 'NGN',
  provider TEXT NOT NULL DEFAULT 'PAYSTACK',
  "providerMode" TEXT NOT NULL DEFAULT 'test',
  "verifiedAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT beneficiaries_account_format CHECK ("accountNumber" ~ '^[0-9]{10}$' AND "bankCode" ~ '^[A-Za-z0-9]{2,20}$' AND length(trim("accountName")) > 0),
  CONSTRAINT beneficiaries_test_ngn CHECK (currency='NGN' AND provider='PAYSTACK' AND "providerMode"='test')
);
CREATE UNIQUE INDEX "beneficiaries_userId_bankCode_accountNumber_key" ON beneficiaries("userId","bankCode","accountNumber");
CREATE INDEX "beneficiaries_userId_createdAt_idx" ON beneficiaries("userId","createdAt");
