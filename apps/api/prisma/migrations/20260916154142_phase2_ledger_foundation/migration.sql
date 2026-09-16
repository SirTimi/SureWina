-- CreateEnum
CREATE TYPE "LedgerAccountType" AS ENUM ('ASSET', 'LIABILITY', 'EQUITY', 'REVENUE', 'EXPENSE');

-- CreateEnum
CREATE TYPE "LedgerOwnerType" AS ENUM ('SYSTEM', 'CUSTOMER', 'AGENT');

-- CreateEnum
CREATE TYPE "LedgerAccountStatus" AS ENUM ('ACTIVE', 'FROZEN', 'CLOSED');

-- CreateEnum
CREATE TYPE "LedgerAccountPurpose" AS ENUM ('PSP_CLEARING', 'BANK_CASH', 'CUSTOMER_AVAILABLE', 'CUSTOMER_HELD', 'AGENT_AVAILABLE', 'AGENT_HELD', 'TICKET_SALES_REVENUE', 'PRIZE_EXPENSE', 'PRIZE_PAYABLE', 'TAX_WHT_PAYABLE', 'REFUND_PAYABLE', 'AGENT_COMMISSION_EXPENSE', 'SUSPENSE');

-- CreateEnum
CREATE TYPE "LedgerEntrySide" AS ENUM ('DEBIT', 'CREDIT');

-- CreateEnum
CREATE TYPE "LedgerTransactionKind" AS ENUM ('OPENING_BALANCE', 'FUNDING', 'PURCHASE', 'PRIZE_ACCRUAL', 'PRIZE_PAYOUT', 'REFUND', 'AGENT_SALE', 'AGENT_REMITTANCE', 'COMMISSION', 'TRANSFER', 'ADJUSTMENT', 'REVERSAL');

-- CreateTable
CREATE TABLE "ledger_accounts" (
    "account_id" TEXT NOT NULL,
    "code" VARCHAR(180) NOT NULL,
    "name" VARCHAR(180) NOT NULL,
    "account_type" "LedgerAccountType" NOT NULL,
    "purpose" "LedgerAccountPurpose" NOT NULL,
    "owner_type" "LedgerOwnerType" NOT NULL DEFAULT 'SYSTEM',
    "owner_id" TEXT,
    "currency" VARCHAR(3) NOT NULL DEFAULT 'NGN',
    "status" "LedgerAccountStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ledger_accounts_pkey" PRIMARY KEY ("account_id")
);

-- CreateTable
CREATE TABLE "ledger_transactions" (
    "ledger_txn_id" TEXT NOT NULL,
    "idempotency_key" VARCHAR(200) NOT NULL,
    "kind" "LedgerTransactionKind" NOT NULL,
    "reference_type" VARCHAR(100) NOT NULL,
    "reference_id" VARCHAR(180) NOT NULL,
    "description" TEXT,
    "currency" VARCHAR(3) NOT NULL DEFAULT 'NGN',
    "total_amount_ngn" INTEGER NOT NULL,
    "entry_count" INTEGER NOT NULL,
    "fingerprint" CHAR(64) NOT NULL,
    "metadata" JSONB,
    "occurred_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reverses_ledger_txn_id" TEXT,

    CONSTRAINT "ledger_transactions_pkey" PRIMARY KEY ("ledger_txn_id")
);

-- CreateTable
CREATE TABLE "ledger_entries" (
    "entry_id" TEXT NOT NULL,
    "ledger_txn_id" TEXT NOT NULL,
    "account_id" TEXT NOT NULL,
    "line_no" INTEGER NOT NULL,
    "side" "LedgerEntrySide" NOT NULL,
    "amount_ngn" INTEGER NOT NULL,
    "memo" VARCHAR(300),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ledger_entries_pkey" PRIMARY KEY ("entry_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ledger_accounts_code_key" ON "ledger_accounts"("code");

-- CreateIndex
CREATE INDEX "ledger_accounts_owner_type_owner_id_idx" ON "ledger_accounts"("owner_type", "owner_id");

-- CreateIndex
CREATE INDEX "ledger_accounts_purpose_currency_idx" ON "ledger_accounts"("purpose", "currency");

-- CreateIndex
CREATE INDEX "ledger_accounts_status_idx" ON "ledger_accounts"("status");

-- CreateIndex
CREATE UNIQUE INDEX "ledger_transactions_idempotency_key_key" ON "ledger_transactions"("idempotency_key");

-- CreateIndex
CREATE UNIQUE INDEX "ledger_transactions_reverses_ledger_txn_id_key" ON "ledger_transactions"("reverses_ledger_txn_id");

-- CreateIndex
CREATE INDEX "ledger_transactions_reference_type_reference_id_idx" ON "ledger_transactions"("reference_type", "reference_id");

-- CreateIndex
CREATE INDEX "ledger_transactions_kind_occurred_at_idx" ON "ledger_transactions"("kind", "occurred_at");

-- CreateIndex
CREATE INDEX "ledger_transactions_created_at_idx" ON "ledger_transactions"("created_at");

-- CreateIndex
CREATE INDEX "ledger_entries_account_id_created_at_idx" ON "ledger_entries"("account_id", "created_at");

-- CreateIndex
CREATE INDEX "ledger_entries_ledger_txn_id_idx" ON "ledger_entries"("ledger_txn_id");

-- CreateIndex
CREATE UNIQUE INDEX "ledger_entries_ledger_txn_id_line_no_key" ON "ledger_entries"("ledger_txn_id", "line_no");

-- AddForeignKey
ALTER TABLE "ledger_transactions" ADD CONSTRAINT "ledger_transactions_reverses_ledger_txn_id_fkey" FOREIGN KEY ("reverses_ledger_txn_id") REFERENCES "ledger_transactions"("ledger_txn_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_ledger_txn_id_fkey" FOREIGN KEY ("ledger_txn_id") REFERENCES "ledger_transactions"("ledger_txn_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "ledger_accounts"("account_id") ON DELETE RESTRICT ON UPDATE CASCADE;
