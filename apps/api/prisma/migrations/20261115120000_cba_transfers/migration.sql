-- AlterEnum
ALTER TYPE "WalletPurchaseStatus" ADD VALUE 'FAILED';
ALTER TYPE "WalletPurchaseStatus" ADD VALUE 'REVIEW_REQUIRED';

-- CreateEnum
CREATE TYPE "WalletPurchaseFundingSource" AS ENUM ('LEDGER', 'CBA');

-- CreateEnum
CREATE TYPE "CbaTransferPurpose" AS ENUM ('WALLET_PURCHASE', 'AGENT_SALE', 'AGENT_COMMISSION', 'REVERSAL');

-- CreateEnum
CREATE TYPE "CbaTransferStatus" AS ENUM ('PENDING', 'SENDING', 'POSTED', 'FAILED', 'UNCERTAIN');

-- AlterTable
ALTER TABLE "wallet_purchases" ADD COLUMN     "failure_reason" VARCHAR(64),
ADD COLUMN     "funding_source" "WalletPurchaseFundingSource" NOT NULL DEFAULT 'LEDGER';

-- CreateTable
CREATE TABLE "cba_transfers" (
    "transfer_id" TEXT NOT NULL,
    "reference" VARCHAR(50) NOT NULL,
    "purpose" "CbaTransferPurpose" NOT NULL,
    "status" "CbaTransferStatus" NOT NULL DEFAULT 'PENDING',
    "wallet_id" TEXT NOT NULL,
    "from_office_id" INTEGER NOT NULL,
    "from_client_id" INTEGER NOT NULL,
    "from_account_id" INTEGER NOT NULL,
    "to_office_id" INTEGER NOT NULL,
    "to_client_id" INTEGER NOT NULL,
    "to_account_id" INTEGER NOT NULL,
    "amount_ngn" INTEGER NOT NULL,
    "wallet_purchase_id" TEXT,
    "payment_txn_id" TEXT,
    "sale_reference" VARCHAR(64),
    "reverses_transfer_id" TEXT,
    "cba_transfer_id" INTEGER,
    "failure_reason" VARCHAR(64),
    "sent_at" TIMESTAMP(3),
    "posted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cba_transfers_pkey" PRIMARY KEY ("transfer_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "cba_transfers_reference_key" ON "cba_transfers"("reference");

-- CreateIndex
CREATE UNIQUE INDEX "cba_transfers_reverses_transfer_id_key" ON "cba_transfers"("reverses_transfer_id");

-- CreateIndex
CREATE INDEX "cba_transfers_status_updated_at_idx" ON "cba_transfers"("status", "updated_at");

-- CreateIndex
CREATE INDEX "cba_transfers_wallet_id_created_at_idx" ON "cba_transfers"("wallet_id", "created_at");

-- CreateIndex
CREATE INDEX "cba_transfers_wallet_purchase_id_idx" ON "cba_transfers"("wallet_purchase_id");

-- CreateIndex
CREATE INDEX "cba_transfers_payment_txn_id_idx" ON "cba_transfers"("payment_txn_id");

-- CreateIndex
CREATE INDEX "cba_transfers_sale_reference_idx" ON "cba_transfers"("sale_reference");

-- CreateIndex
CREATE INDEX "wallet_purchases_wallet_id_status_idx" ON "wallet_purchases"("wallet_id", "status");

-- AddForeignKey
ALTER TABLE "cba_transfers" ADD CONSTRAINT "cba_transfers_wallet_id_fkey" FOREIGN KEY ("wallet_id") REFERENCES "wallets"("wallet_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cba_transfers" ADD CONSTRAINT "cba_transfers_wallet_purchase_id_fkey" FOREIGN KEY ("wallet_purchase_id") REFERENCES "wallet_purchases"("purchase_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cba_transfers" ADD CONSTRAINT "cba_transfers_payment_txn_id_fkey" FOREIGN KEY ("payment_txn_id") REFERENCES "payment_transactions"("txn_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cba_transfers" ADD CONSTRAINT "cba_transfers_reverses_transfer_id_fkey" FOREIGN KEY ("reverses_transfer_id") REFERENCES "cba_transfers"("transfer_id") ON DELETE RESTRICT ON UPDATE CASCADE;
