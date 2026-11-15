-- AlterEnum
ALTER TYPE "CbaTransferPurpose" ADD VALUE 'WITHDRAWAL_LOCK';
ALTER TYPE "CbaTransferPurpose" ADD VALUE 'WITHDRAWAL_RESTORE';

-- CreateEnum
CREATE TYPE "CbaWithdrawalStatus" AS ENUM ('LOCKING', 'FAILED', 'AWAITING_APPROVAL', 'LOCKED', 'PAYOUT_PENDING', 'PAID', 'SUCCEEDED', 'RESTORED', 'REVIEW_REQUIRED');

-- CreateTable
CREATE TABLE "cba_withdrawals" (
    "withdrawal_id" TEXT NOT NULL,
    "wallet_id" TEXT NOT NULL,
    "owner_type" "LedgerOwnerType" NOT NULL,
    "request_id" VARCHAR(64) NOT NULL,
    "withdrawal_account_id" TEXT NOT NULL,
    "source_purpose" "WitmangoWalletPurpose" NOT NULL,
    "amount_ngn" INTEGER NOT NULL,
    "status" "CbaWithdrawalStatus" NOT NULL DEFAULT 'LOCKING',
    "failure_reason" VARCHAR(64),
    "bank_code" VARCHAR(6) NOT NULL,
    "account_last4" VARCHAR(4) NOT NULL,
    "account_fingerprint" VARCHAR(64) NOT NULL,
    "lock_transfer_id" TEXT,
    "restore_transfer_id" TEXT,
    "requires_approval" BOOLEAN NOT NULL DEFAULT false,
    "approved_by" TEXT,
    "approved_at" TIMESTAMP(3),
    "rejected_by" TEXT,
    "rejected_at" TIMESTAMP(3),
    "payout_reference" VARCHAR(64) NOT NULL,
    "payout_status" "PrizePayoutStatus",
    "payout_raw_status" VARCHAR(64),
    "provider_transaction_reference" VARCHAR(120),
    "payout_submitted_at" TIMESTAMP(3),
    "payout_completed_at" TIMESTAMP(3),
    "payout_last_checked_at" TIMESTAMP(3),
    "settlement_reference" VARCHAR(50) NOT NULL,
    "settlement_transaction_id" INTEGER,
    "settled_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cba_withdrawals_pkey" PRIMARY KEY ("withdrawal_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "cba_withdrawals_lock_transfer_id_key" ON "cba_withdrawals"("lock_transfer_id");

-- CreateIndex
CREATE UNIQUE INDEX "cba_withdrawals_restore_transfer_id_key" ON "cba_withdrawals"("restore_transfer_id");

-- CreateIndex
CREATE UNIQUE INDEX "cba_withdrawals_payout_reference_key" ON "cba_withdrawals"("payout_reference");

-- CreateIndex
CREATE UNIQUE INDEX "cba_withdrawals_settlement_reference_key" ON "cba_withdrawals"("settlement_reference");

-- CreateIndex
CREATE INDEX "cba_withdrawals_wallet_id_status_idx" ON "cba_withdrawals"("wallet_id", "status");

-- CreateIndex
CREATE INDEX "cba_withdrawals_wallet_id_created_at_idx" ON "cba_withdrawals"("wallet_id", "created_at");

-- CreateIndex
CREATE INDEX "cba_withdrawals_status_updated_at_idx" ON "cba_withdrawals"("status", "updated_at");

-- CreateIndex
CREATE UNIQUE INDEX "cba_withdrawals_wallet_id_request_id_key" ON "cba_withdrawals"("wallet_id", "request_id");

-- AddForeignKey
ALTER TABLE "cba_withdrawals" ADD CONSTRAINT "cba_withdrawals_wallet_id_fkey" FOREIGN KEY ("wallet_id") REFERENCES "wallets"("wallet_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cba_withdrawals" ADD CONSTRAINT "cba_withdrawals_withdrawal_account_id_fkey" FOREIGN KEY ("withdrawal_account_id") REFERENCES "withdrawal_accounts"("withdrawal_account_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cba_withdrawals" ADD CONSTRAINT "cba_withdrawals_lock_transfer_id_fkey" FOREIGN KEY ("lock_transfer_id") REFERENCES "cba_transfers"("transfer_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cba_withdrawals" ADD CONSTRAINT "cba_withdrawals_restore_transfer_id_fkey" FOREIGN KEY ("restore_transfer_id") REFERENCES "cba_transfers"("transfer_id") ON DELETE RESTRICT ON UPDATE CASCADE;
