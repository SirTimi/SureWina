-- CreateEnum
CREATE TYPE "CbaBalanceMigrationStatus" AS ENUM ('PENDING', 'CREDITED', 'FAILED', 'REVIEW_REQUIRED');

-- CreateTable
CREATE TABLE "cba_balance_migrations" (
    "migration_id" TEXT NOT NULL,
    "wallet_id" TEXT NOT NULL,
    "amount_ngn" INTEGER NOT NULL,
    "purpose" "WitmangoWalletPurpose" NOT NULL,
    "status" "CbaBalanceMigrationStatus" NOT NULL DEFAULT 'PENDING',
    "savings_account_id" INTEGER NOT NULL,
    "cba_reference" VARCHAR(50) NOT NULL,
    "cba_transaction_id" INTEGER,
    "ledger_txn_id" TEXT,
    "reversal_ledger_txn_id" TEXT,
    "failure_reason" VARCHAR(64),
    "created_by" TEXT NOT NULL,
    "credited_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cba_balance_migrations_pkey" PRIMARY KEY ("migration_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "cba_balance_migrations_wallet_id_key" ON "cba_balance_migrations"("wallet_id");

-- CreateIndex
CREATE UNIQUE INDEX "cba_balance_migrations_cba_reference_key" ON "cba_balance_migrations"("cba_reference");

-- CreateIndex
CREATE INDEX "cba_balance_migrations_status_updated_at_idx" ON "cba_balance_migrations"("status", "updated_at");

-- AddForeignKey
ALTER TABLE "cba_balance_migrations" ADD CONSTRAINT "cba_balance_migrations_wallet_id_fkey" FOREIGN KEY ("wallet_id") REFERENCES "wallets"("wallet_id") ON DELETE RESTRICT ON UPDATE CASCADE;
