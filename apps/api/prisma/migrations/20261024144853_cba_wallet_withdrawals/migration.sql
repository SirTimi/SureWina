-- CreateEnum
CREATE TYPE "WalletWithdrawalStatus" AS ENUM ('RESERVED', 'CBA_DEBIT_UNKNOWN', 'CBA_DEBIT_CONFIRMED', 'BANK_TRANSFER_PENDING', 'BANK_TRANSFER_UNKNOWN', 'SUCCEEDED', 'RESTORE_REQUIRED', 'RESTORED', 'REVIEW_REQUIRED', 'CANCELLED');

-- CreateTable
CREATE TABLE "wallet_withdrawals" (
    "withdrawal_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "wallet_id" TEXT NOT NULL,
    "payout_account_id" TEXT NOT NULL,
    "hold_id" TEXT NOT NULL,
    "request_id" VARCHAR(64) NOT NULL,
    "tenant_id" VARCHAR(100) NOT NULL,
    "savings_account_id" INTEGER NOT NULL,
    "amount_ngn" INTEGER NOT NULL,
    "currency" VARCHAR(3) NOT NULL DEFAULT 'NGN',
    "bank_code" VARCHAR(6) NOT NULL,
    "bank_account_last4" VARCHAR(4) NOT NULL,
    "bank_fingerprint" VARCHAR(64) NOT NULL,
    "bank_ciphertext" TEXT NOT NULL,
    "cba_reference" VARCHAR(50) NOT NULL,
    "cba_transaction_id" VARCHAR(120),
    "paystack_reference" VARCHAR(50) NOT NULL,
    "paystack_transaction_id" VARCHAR(120),
    "status" "WalletWithdrawalStatus" NOT NULL DEFAULT 'RESERVED',
    "failure_code" VARCHAR(120),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "resolved_at" TIMESTAMP(3),

    CONSTRAINT "wallet_withdrawals_pkey" PRIMARY KEY ("withdrawal_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "wallet_withdrawals_hold_id_key" ON "wallet_withdrawals"("hold_id");

-- CreateIndex
CREATE UNIQUE INDEX "wallet_withdrawals_cba_reference_key" ON "wallet_withdrawals"("cba_reference");

-- CreateIndex
CREATE UNIQUE INDEX "wallet_withdrawals_paystack_reference_key" ON "wallet_withdrawals"("paystack_reference");

-- CreateIndex
CREATE INDEX "wallet_withdrawals_wallet_id_status_idx" ON "wallet_withdrawals"("wallet_id", "status");

-- CreateIndex
CREATE INDEX "wallet_withdrawals_status_updated_at_idx" ON "wallet_withdrawals"("status", "updated_at");

-- CreateIndex
CREATE UNIQUE INDEX "wallet_withdrawals_user_id_request_id_key" ON "wallet_withdrawals"("user_id", "request_id");

-- CreateIndex
CREATE UNIQUE INDEX "wallet_withdrawals_tenant_id_cba_transaction_id_key" ON "wallet_withdrawals"("tenant_id", "cba_transaction_id");

-- AddForeignKey
ALTER TABLE "wallet_withdrawals" ADD CONSTRAINT "wallet_withdrawals_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("user_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wallet_withdrawals" ADD CONSTRAINT "wallet_withdrawals_wallet_id_fkey" FOREIGN KEY ("wallet_id") REFERENCES "wallets"("wallet_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wallet_withdrawals" ADD CONSTRAINT "wallet_withdrawals_payout_account_id_fkey" FOREIGN KEY ("payout_account_id") REFERENCES "verified_payout_accounts"("payout_account_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wallet_withdrawals" ADD CONSTRAINT "wallet_withdrawals_hold_id_fkey" FOREIGN KEY ("hold_id") REFERENCES "wallet_holds"("hold_id") ON DELETE RESTRICT ON UPDATE CASCADE;
