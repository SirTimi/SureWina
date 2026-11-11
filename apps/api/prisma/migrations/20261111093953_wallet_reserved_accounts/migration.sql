-- CreateEnum
CREATE TYPE "ReservedAccountStatus" AS ENUM ('PROVISIONING', 'ACTIVE', 'REVIEW_REQUIRED');

-- CreateTable
CREATE TABLE "wallet_reserved_accounts" (
    "reserved_account_id" TEXT NOT NULL,
    "wallet_id" TEXT NOT NULL,
    "account_reference" VARCHAR(64) NOT NULL,
    "reservation_reference" VARCHAR(64),
    "customer_name" VARCHAR(101) NOT NULL,
    "limit_profile_code" VARCHAR(40) NOT NULL,
    "accounts" JSONB,
    "status" "ReservedAccountStatus" NOT NULL DEFAULT 'PROVISIONING',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "wallet_reserved_accounts_pkey" PRIMARY KEY ("reserved_account_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "wallet_reserved_accounts_wallet_id_key" ON "wallet_reserved_accounts"("wallet_id");

-- CreateIndex
CREATE UNIQUE INDEX "wallet_reserved_accounts_account_reference_key" ON "wallet_reserved_accounts"("account_reference");

-- CreateIndex
CREATE UNIQUE INDEX "wallet_reserved_accounts_reservation_reference_key" ON "wallet_reserved_accounts"("reservation_reference");

-- CreateIndex
CREATE INDEX "wallet_reserved_accounts_status_updated_at_idx" ON "wallet_reserved_accounts"("status", "updated_at");

-- AddForeignKey
ALTER TABLE "wallet_reserved_accounts" ADD CONSTRAINT "wallet_reserved_accounts_wallet_id_fkey" FOREIGN KEY ("wallet_id") REFERENCES "wallets"("wallet_id") ON DELETE RESTRICT ON UPDATE CASCADE;
