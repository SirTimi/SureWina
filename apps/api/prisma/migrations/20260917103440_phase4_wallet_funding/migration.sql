-- CreateEnum
CREATE TYPE "WalletFundingStatus" AS ENUM ('PENDING', 'PROCESSING', 'CREDITED', 'REVIEW_REQUIRED', 'FAILED');

-- CreateTable
CREATE TABLE "wallet_fundings" (
    "funding_id" TEXT NOT NULL,
    "wallet_id" TEXT NOT NULL,
    "gateway_reference" TEXT NOT NULL,
    "gateway" "PaymentGateway" NOT NULL,
    "amount_ngn" INTEGER NOT NULL,
    "currency" VARCHAR(3) NOT NULL DEFAULT 'NGN',
    "status" "WalletFundingStatus" NOT NULL DEFAULT 'PENDING',
    "provider_transaction_id" TEXT,
    "ledger_txn_id" TEXT,
    "failure_reason" TEXT,
    "verification_payload" JSONB,
    "initiated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_verified_at" TIMESTAMP(3),
    "credited_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "wallet_fundings_pkey" PRIMARY KEY ("funding_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "wallet_fundings_gateway_reference_key" ON "wallet_fundings"("gateway_reference");

-- CreateIndex
CREATE UNIQUE INDEX "wallet_fundings_ledger_txn_id_key" ON "wallet_fundings"("ledger_txn_id");

-- CreateIndex
CREATE INDEX "wallet_fundings_wallet_id_created_at_idx" ON "wallet_fundings"("wallet_id", "created_at");

-- CreateIndex
CREATE INDEX "wallet_fundings_gateway_status_idx" ON "wallet_fundings"("gateway", "status");

-- CreateIndex
CREATE INDEX "wallet_fundings_status_created_at_idx" ON "wallet_fundings"("status", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "wallet_fundings_gateway_provider_transaction_id_key" ON "wallet_fundings"("gateway", "provider_transaction_id");

-- AddForeignKey
ALTER TABLE "wallet_fundings" ADD CONSTRAINT "wallet_fundings_wallet_id_fkey" FOREIGN KEY ("wallet_id") REFERENCES "wallets"("wallet_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wallet_fundings" ADD CONSTRAINT "wallet_fundings_ledger_txn_id_fkey" FOREIGN KEY ("ledger_txn_id") REFERENCES "ledger_transactions"("ledger_txn_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ============================================================
-- PHASE 4 WALLET FUNDING INVARIANTS
-- ============================================================

ALTER TABLE "wallet_fundings"
ADD CONSTRAINT "wallet_funding_amount_positive"
CHECK ("amount_ngn" > 0);

ALTER TABLE "wallet_fundings"
ADD CONSTRAINT "wallet_funding_currency_format"
CHECK (
  char_length("currency") = 3
  AND "currency" = upper("currency")
);

ALTER TABLE "wallet_fundings"
ADD CONSTRAINT "wallet_funding_online_gateway_only"
CHECK (
  "gateway"::text IN ('PAYSTACK', 'FLUTTERWAVE')
);

ALTER TABLE "wallet_fundings"
ADD CONSTRAINT "wallet_funding_credit_state_consistency"
CHECK (
  (
    "status"::text = 'CREDITED'
    AND "ledger_txn_id" IS NOT NULL
    AND "credited_at" IS NOT NULL
  )
  OR
  (
    "status"::text <> 'CREDITED'
    AND "ledger_txn_id" IS NULL
    AND "credited_at" IS NULL
  )
);