-- CreateEnum
CREATE TYPE "WithdrawalAccountStatus" AS ENUM ('ACTIVE', 'REJECTED', 'REMOVED');

-- CreateTable
CREATE TABLE "withdrawal_accounts" (
    "withdrawal_account_id" TEXT NOT NULL,
    "wallet_id" TEXT NOT NULL,
    "owner_type" "LedgerOwnerType" NOT NULL,
    "bank_code" VARCHAR(6) NOT NULL,
    "bank_name" VARCHAR(140),
    "account_ciphertext" TEXT NOT NULL,
    "account_last4" VARCHAR(4) NOT NULL,
    "account_fingerprint" VARCHAR(64) NOT NULL,
    "account_name" VARCHAR(200),
    "status" "WithdrawalAccountStatus" NOT NULL,
    "verified_at" TIMESTAMP(3),
    "usable_from" TIMESTAMP(3),
    "removed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "withdrawal_accounts_pkey" PRIMARY KEY ("withdrawal_account_id")
);

-- CreateIndex
CREATE INDEX "withdrawal_accounts_wallet_id_status_idx" ON "withdrawal_accounts"("wallet_id", "status");

-- CreateIndex
CREATE INDEX "withdrawal_accounts_wallet_id_account_fingerprint_idx" ON "withdrawal_accounts"("wallet_id", "account_fingerprint");

-- CreateIndex
CREATE INDEX "withdrawal_accounts_wallet_id_created_at_idx" ON "withdrawal_accounts"("wallet_id", "created_at");

-- AddForeignKey
ALTER TABLE "withdrawal_accounts" ADD CONSTRAINT "withdrawal_accounts_wallet_id_fkey" FOREIGN KEY ("wallet_id") REFERENCES "wallets"("wallet_id") ON DELETE RESTRICT ON UPDATE CASCADE;
