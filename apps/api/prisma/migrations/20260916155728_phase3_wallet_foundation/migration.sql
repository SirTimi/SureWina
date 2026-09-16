-- CreateEnum
CREATE TYPE "WalletStatus" AS ENUM ('ACTIVE', 'FROZEN', 'CLOSED');

-- CreateEnum
CREATE TYPE "WalletHoldStatus" AS ENUM ('HELD', 'RELEASED', 'CAPTURED');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "LedgerTransactionKind" ADD VALUE 'WALLET_HOLD';
ALTER TYPE "LedgerTransactionKind" ADD VALUE 'WALLET_RELEASE';
ALTER TYPE "LedgerTransactionKind" ADD VALUE 'WALLET_CAPTURE';

-- CreateTable
CREATE TABLE "wallets" (
    "wallet_id" TEXT NOT NULL,
    "owner_type" "LedgerOwnerType" NOT NULL,
    "user_id" TEXT,
    "agent_id" TEXT,
    "currency" VARCHAR(3) NOT NULL DEFAULT 'NGN',
    "status" "WalletStatus" NOT NULL DEFAULT 'ACTIVE',
    "available_account_id" TEXT NOT NULL,
    "held_account_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "wallets_pkey" PRIMARY KEY ("wallet_id")
);

-- CreateTable
CREATE TABLE "wallet_holds" (
    "hold_id" TEXT NOT NULL,
    "wallet_id" TEXT NOT NULL,
    "idempotency_key" VARCHAR(200) NOT NULL,
    "reference_type" VARCHAR(100) NOT NULL,
    "reference_id" VARCHAR(180) NOT NULL,
    "amount_ngn" INTEGER NOT NULL,
    "status" "WalletHoldStatus" NOT NULL DEFAULT 'HELD',
    "hold_ledger_txn_id" TEXT NOT NULL,
    "release_ledger_txn_id" TEXT,
    "capture_ledger_txn_id" TEXT,
    "release_idempotency_key" VARCHAR(200),
    "capture_idempotency_key" VARCHAR(200),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolved_at" TIMESTAMP(3),

    CONSTRAINT "wallet_holds_pkey" PRIMARY KEY ("hold_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "wallets_user_id_key" ON "wallets"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "wallets_agent_id_key" ON "wallets"("agent_id");

-- CreateIndex
CREATE UNIQUE INDEX "wallets_available_account_id_key" ON "wallets"("available_account_id");

-- CreateIndex
CREATE UNIQUE INDEX "wallets_held_account_id_key" ON "wallets"("held_account_id");

-- CreateIndex
CREATE INDEX "wallets_owner_type_status_idx" ON "wallets"("owner_type", "status");

-- CreateIndex
CREATE INDEX "wallets_created_at_idx" ON "wallets"("created_at");

-- CreateIndex
CREATE UNIQUE INDEX "wallet_holds_idempotency_key_key" ON "wallet_holds"("idempotency_key");

-- CreateIndex
CREATE UNIQUE INDEX "wallet_holds_hold_ledger_txn_id_key" ON "wallet_holds"("hold_ledger_txn_id");

-- CreateIndex
CREATE UNIQUE INDEX "wallet_holds_release_ledger_txn_id_key" ON "wallet_holds"("release_ledger_txn_id");

-- CreateIndex
CREATE UNIQUE INDEX "wallet_holds_capture_ledger_txn_id_key" ON "wallet_holds"("capture_ledger_txn_id");

-- CreateIndex
CREATE UNIQUE INDEX "wallet_holds_release_idempotency_key_key" ON "wallet_holds"("release_idempotency_key");

-- CreateIndex
CREATE UNIQUE INDEX "wallet_holds_capture_idempotency_key_key" ON "wallet_holds"("capture_idempotency_key");

-- CreateIndex
CREATE INDEX "wallet_holds_wallet_id_status_idx" ON "wallet_holds"("wallet_id", "status");

-- CreateIndex
CREATE INDEX "wallet_holds_reference_type_reference_id_idx" ON "wallet_holds"("reference_type", "reference_id");

-- AddForeignKey
ALTER TABLE "wallets" ADD CONSTRAINT "wallets_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("user_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wallets" ADD CONSTRAINT "wallets_agent_id_fkey" FOREIGN KEY ("agent_id") REFERENCES "agents"("agent_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wallets" ADD CONSTRAINT "wallets_available_account_id_fkey" FOREIGN KEY ("available_account_id") REFERENCES "ledger_accounts"("account_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wallets" ADD CONSTRAINT "wallets_held_account_id_fkey" FOREIGN KEY ("held_account_id") REFERENCES "ledger_accounts"("account_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wallet_holds" ADD CONSTRAINT "wallet_holds_wallet_id_fkey" FOREIGN KEY ("wallet_id") REFERENCES "wallets"("wallet_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wallet_holds" ADD CONSTRAINT "wallet_holds_hold_ledger_txn_id_fkey" FOREIGN KEY ("hold_ledger_txn_id") REFERENCES "ledger_transactions"("ledger_txn_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wallet_holds" ADD CONSTRAINT "wallet_holds_release_ledger_txn_id_fkey" FOREIGN KEY ("release_ledger_txn_id") REFERENCES "ledger_transactions"("ledger_txn_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wallet_holds" ADD CONSTRAINT "wallet_holds_capture_ledger_txn_id_fkey" FOREIGN KEY ("capture_ledger_txn_id") REFERENCES "ledger_transactions"("ledger_txn_id") ON DELETE RESTRICT ON UPDATE CASCADE;
