CREATE TYPE "FundingStatus" AS ENUM ('INITIALIZING', 'PENDING', 'INITIALIZATION_UNKNOWN', 'SUCCESS', 'FAILED');

CREATE TABLE "funding_requests" (
  "id" TEXT NOT NULL,
  "reference" TEXT NOT NULL,
  "idempotencyKey" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "walletId" TEXT NOT NULL,
  "expectedEmail" TEXT NOT NULL,
  "amountMinor" BIGINT NOT NULL,
  "currency" TEXT NOT NULL,
  "provider" TEXT NOT NULL DEFAULT 'PAYSTACK',
  "providerMode" TEXT NOT NULL DEFAULT 'test',
  "status" "FundingStatus" NOT NULL DEFAULT 'INITIALIZING',
  "authorizationUrl" TEXT,
  "accessCode" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "funding_requests_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "funding_requests_positive_amount" CHECK ("amountMinor" > 0),
  CONSTRAINT "funding_requests_test_ngn" CHECK ("currency" = 'NGN' AND "provider" = 'PAYSTACK' AND "providerMode" = 'test'),
  CONSTRAINT "funding_requests_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "funding_requests_walletId_fkey" FOREIGN KEY ("walletId") REFERENCES "wallets"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "funding_requests_reference_key" ON "funding_requests"("reference");
CREATE UNIQUE INDEX "funding_requests_userId_idempotencyKey_key" ON "funding_requests"("userId", "idempotencyKey");
CREATE INDEX "funding_requests_status_createdAt_idx" ON "funding_requests"("status", "createdAt");
CREATE INDEX "funding_requests_walletId_createdAt_idx" ON "funding_requests"("walletId", "createdAt");
