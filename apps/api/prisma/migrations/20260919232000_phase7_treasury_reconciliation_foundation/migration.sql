-- Phase 7: Treasury & reconciliation foundation

-- Extend ledger enums.
ALTER TYPE "LedgerAccountPurpose" ADD VALUE 'AGENT_RECEIVABLE';
ALTER TYPE "LedgerAccountPurpose" ADD VALUE 'PAYMENT_PROCESSING_FEES';

ALTER TYPE "LedgerTransactionKind" ADD VALUE 'PROVIDER_COLLECTION';
ALTER TYPE "LedgerTransactionKind" ADD VALUE 'PROVIDER_SETTLEMENT';
ALTER TYPE "LedgerTransactionKind" ADD VALUE 'REFUND_ACCRUAL';
ALTER TYPE "LedgerTransactionKind" ADD VALUE 'REFUND_SETTLEMENT';
ALTER TYPE "LedgerTransactionKind" ADD VALUE 'TREASURY_TRANSFER';

-- Treasury enums.
CREATE TYPE "TreasuryProvider" AS ENUM ('PAYSTACK', 'FLUTTERWAVE', 'MONNIFY', 'BANK');
CREATE TYPE "TreasuryAccountKind" AS ENUM ('COLLECTION_CLEARING', 'PAYOUT_WALLET', 'BANK_ACCOUNT');
CREATE TYPE "TreasuryAccountStatus" AS ENUM ('ACTIVE', 'DISABLED');
CREATE TYPE "TreasurySettlementStatus" AS ENUM ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED', 'FLAGGED', 'UNKNOWN');
CREATE TYPE "ReconciliationRunType" AS ENUM ('TRANSACTION', 'SETTLEMENT', 'BALANCE', 'FULL');
CREATE TYPE "ReconciliationRunStatus" AS ENUM ('RUNNING', 'COMPLETED', 'COMPLETED_WITH_EXCEPTIONS', 'FAILED');
CREATE TYPE "ReconciliationIssueType" AS ENUM (
  'MISSING_INTERNAL',
  'MISSING_EXTERNAL',
  'UNMAPPED_REFERENCE',
  'DUPLICATE_EXTERNAL',
  'AMOUNT_MISMATCH',
  'CURRENCY_MISMATCH',
  'STATUS_MISMATCH',
  'FEE_MISMATCH',
  'SETTLEMENT_SHORTFALL',
  'BALANCE_VARIANCE'
);
CREATE TYPE "ReconciliationIssueStatus" AS ENUM ('OPEN', 'RESOLVED', 'IGNORED');

-- Link provider collections/refunds to immutable ledger journals.
ALTER TABLE "payment_transactions"
  ADD COLUMN "collection_ledger_txn_id" TEXT,
  ADD COLUMN "refund_accrual_ledger_txn_id" TEXT,
  ADD COLUMN "refund_settlement_ledger_txn_id" TEXT;

CREATE UNIQUE INDEX "payment_transactions_collection_ledger_txn_id_key"
  ON "payment_transactions"("collection_ledger_txn_id");
CREATE UNIQUE INDEX "payment_transactions_refund_accrual_ledger_txn_id_key"
  ON "payment_transactions"("refund_accrual_ledger_txn_id");
CREATE UNIQUE INDEX "payment_transactions_refund_settlement_ledger_txn_id_key"
  ON "payment_transactions"("refund_settlement_ledger_txn_id");

ALTER TABLE "payment_transactions"
  ADD CONSTRAINT "payment_transactions_collection_ledger_txn_id_fkey"
  FOREIGN KEY ("collection_ledger_txn_id")
  REFERENCES "ledger_transactions"("ledger_txn_id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "payment_transactions"
  ADD CONSTRAINT "payment_transactions_refund_accrual_ledger_txn_id_fkey"
  FOREIGN KEY ("refund_accrual_ledger_txn_id")
  REFERENCES "ledger_transactions"("ledger_txn_id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "payment_transactions"
  ADD CONSTRAINT "payment_transactions_refund_settlement_ledger_txn_id_fkey"
  FOREIGN KEY ("refund_settlement_ledger_txn_id")
  REFERENCES "ledger_transactions"("ledger_txn_id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

-- Treasury accounts map internal ledger accounts to external money locations.
CREATE TABLE "treasury_accounts" (
  "treasury_account_id" TEXT NOT NULL,
  "code" VARCHAR(180) NOT NULL,
  "name" VARCHAR(180) NOT NULL,
  "provider" "TreasuryProvider" NOT NULL,
  "kind" "TreasuryAccountKind" NOT NULL,
  "currency" VARCHAR(3) NOT NULL DEFAULT 'NGN',
  "ledger_account_id" TEXT NOT NULL,
  "external_account_reference" VARCHAR(200),
  "bank_code" VARCHAR(32),
  "account_last4" VARCHAR(4),
  "status" "TreasuryAccountStatus" NOT NULL DEFAULT 'ACTIVE',
  "metadata" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "treasury_accounts_pkey" PRIMARY KEY ("treasury_account_id")
);

CREATE UNIQUE INDEX "treasury_accounts_code_key"
  ON "treasury_accounts"("code");
CREATE UNIQUE INDEX "treasury_accounts_ledger_account_id_key"
  ON "treasury_accounts"("ledger_account_id");
CREATE INDEX "treasury_accounts_provider_kind_idx"
  ON "treasury_accounts"("provider", "kind");
CREATE INDEX "treasury_accounts_status_idx"
  ON "treasury_accounts"("status");

ALTER TABLE "treasury_accounts"
  ADD CONSTRAINT "treasury_accounts_ledger_account_id_fkey"
  FOREIGN KEY ("ledger_account_id")
  REFERENCES "ledger_accounts"("account_id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "treasury_accounts"
  ADD CONSTRAINT "treasury_account_currency_ngn"
  CHECK ("currency" = 'NGN');

ALTER TABLE "treasury_accounts"
  ADD CONSTRAINT "treasury_account_last4_format"
  CHECK (
    "account_last4" IS NULL
    OR "account_last4" ~ '^[0-9]{4}$'
  );

-- Snapshots preserve exact external balances in minor units.
CREATE TABLE "treasury_balance_snapshots" (
  "snapshot_id" TEXT NOT NULL,
  "treasury_account_id" TEXT NOT NULL,
  "external_balance_minor" BIGINT NOT NULL,
  "internal_balance_minor" BIGINT NOT NULL,
  "variance_minor" BIGINT NOT NULL,
  "observed_at" TIMESTAMP(3) NOT NULL,
  "external_reference" VARCHAR(200),
  "raw_payload" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "treasury_balance_snapshots_pkey" PRIMARY KEY ("snapshot_id")
);

CREATE INDEX "treasury_balance_snapshots_treasury_account_id_observed_at_idx"
  ON "treasury_balance_snapshots"("treasury_account_id", "observed_at");
CREATE INDEX "treasury_balance_snapshots_observed_at_idx"
  ON "treasury_balance_snapshots"("observed_at");

ALTER TABLE "treasury_balance_snapshots"
  ADD CONSTRAINT "treasury_balance_snapshots_treasury_account_id_fkey"
  FOREIGN KEY ("treasury_account_id")
  REFERENCES "treasury_accounts"("treasury_account_id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

-- Provider settlement batches.
CREATE TABLE "treasury_settlements" (
  "settlement_id" TEXT NOT NULL,
  "treasury_account_id" TEXT NOT NULL,
  "provider" "TreasuryProvider" NOT NULL,
  "provider_settlement_id" VARCHAR(200) NOT NULL,
  "currency" VARCHAR(3) NOT NULL DEFAULT 'NGN',
  "gross_amount_minor" BIGINT NOT NULL,
  "fee_amount_minor" BIGINT NOT NULL DEFAULT 0,
  "refund_amount_minor" BIGINT NOT NULL DEFAULT 0,
  "chargeback_amount_minor" BIGINT NOT NULL DEFAULT 0,
  "net_amount_minor" BIGINT NOT NULL,
  "status" "TreasurySettlementStatus" NOT NULL DEFAULT 'PENDING',
  "destination" VARCHAR(120),
  "destination_reference" VARCHAR(200),
  "settlement_date" TIMESTAMP(3),
  "processed_at" TIMESTAMP(3),
  "ledger_txn_id" TEXT,
  "raw_payload" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "treasury_settlements_pkey" PRIMARY KEY ("settlement_id")
);

CREATE UNIQUE INDEX "treasury_settlements_ledger_txn_id_key"
  ON "treasury_settlements"("ledger_txn_id");
CREATE UNIQUE INDEX "treasury_settlements_provider_provider_settlement_id_key"
  ON "treasury_settlements"("provider", "provider_settlement_id");
CREATE INDEX "treasury_settlements_treasury_account_id_settlement_date_idx"
  ON "treasury_settlements"("treasury_account_id", "settlement_date");
CREATE INDEX "treasury_settlements_provider_status_idx"
  ON "treasury_settlements"("provider", "status");
CREATE INDEX "treasury_settlements_status_processed_at_idx"
  ON "treasury_settlements"("status", "processed_at");

ALTER TABLE "treasury_settlements"
  ADD CONSTRAINT "treasury_settlements_treasury_account_id_fkey"
  FOREIGN KEY ("treasury_account_id")
  REFERENCES "treasury_accounts"("treasury_account_id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "treasury_settlements"
  ADD CONSTRAINT "treasury_settlements_ledger_txn_id_fkey"
  FOREIGN KEY ("ledger_txn_id")
  REFERENCES "ledger_transactions"("ledger_txn_id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "treasury_settlements"
  ADD CONSTRAINT "treasury_settlement_currency_ngn"
  CHECK ("currency" = 'NGN');

ALTER TABLE "treasury_settlements"
  ADD CONSTRAINT "treasury_settlement_amounts_nonnegative"
  CHECK (
    "gross_amount_minor" >= 0
    AND "fee_amount_minor" >= 0
    AND "refund_amount_minor" >= 0
    AND "chargeback_amount_minor" >= 0
    AND "net_amount_minor" >= 0
  );

-- Individual settlement constituents link external references back to SureWina money events.
CREATE TABLE "treasury_settlement_lines" (
  "settlement_line_id" TEXT NOT NULL,
  "settlement_id" TEXT NOT NULL,
  "provider_transaction_id" VARCHAR(200),
  "provider_reference" VARCHAR(200),
  "gross_amount_minor" BIGINT NOT NULL,
  "fee_amount_minor" BIGINT NOT NULL DEFAULT 0,
  "net_amount_minor" BIGINT NOT NULL,
  "currency" VARCHAR(3) NOT NULL DEFAULT 'NGN',
  "payment_txn_id" TEXT,
  "wallet_funding_id" TEXT,
  "raw_payload" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "treasury_settlement_lines_pkey" PRIMARY KEY ("settlement_line_id")
);

CREATE INDEX "treasury_settlement_lines_settlement_id_idx"
  ON "treasury_settlement_lines"("settlement_id");
CREATE INDEX "treasury_settlement_lines_provider_reference_idx"
  ON "treasury_settlement_lines"("provider_reference");
CREATE INDEX "treasury_settlement_lines_provider_transaction_id_idx"
  ON "treasury_settlement_lines"("provider_transaction_id");
CREATE INDEX "treasury_settlement_lines_payment_txn_id_idx"
  ON "treasury_settlement_lines"("payment_txn_id");
CREATE INDEX "treasury_settlement_lines_wallet_funding_id_idx"
  ON "treasury_settlement_lines"("wallet_funding_id");

ALTER TABLE "treasury_settlement_lines"
  ADD CONSTRAINT "treasury_settlement_lines_settlement_id_fkey"
  FOREIGN KEY ("settlement_id")
  REFERENCES "treasury_settlements"("settlement_id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "treasury_settlement_lines"
  ADD CONSTRAINT "treasury_settlement_lines_payment_txn_id_fkey"
  FOREIGN KEY ("payment_txn_id")
  REFERENCES "payment_transactions"("txn_id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "treasury_settlement_lines"
  ADD CONSTRAINT "treasury_settlement_lines_wallet_funding_id_fkey"
  FOREIGN KEY ("wallet_funding_id")
  REFERENCES "wallet_fundings"("funding_id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "treasury_settlement_lines"
  ADD CONSTRAINT "treasury_settlement_line_currency_ngn"
  CHECK ("currency" = 'NGN');

ALTER TABLE "treasury_settlement_lines"
  ADD CONSTRAINT "treasury_settlement_line_amounts_nonnegative"
  CHECK (
    "gross_amount_minor" >= 0
    AND "fee_amount_minor" >= 0
    AND "net_amount_minor" >= 0
  );

-- Each run records what was checked and whether Finance has unresolved exceptions.
CREATE TABLE "reconciliation_runs" (
  "run_id" TEXT NOT NULL,
  "run_type" "ReconciliationRunType" NOT NULL,
  "provider" "TreasuryProvider",
  "treasury_account_id" TEXT,
  "status" "ReconciliationRunStatus" NOT NULL DEFAULT 'RUNNING',
  "period_from" TIMESTAMP(3) NOT NULL,
  "period_to" TIMESTAMP(3) NOT NULL,
  "records_scanned" INTEGER NOT NULL DEFAULT 0,
  "records_matched" INTEGER NOT NULL DEFAULT 0,
  "issue_count" INTEGER NOT NULL DEFAULT 0,
  "variance_minor" BIGINT NOT NULL DEFAULT 0,
  "error_message" TEXT,
  "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completed_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "reconciliation_runs_pkey" PRIMARY KEY ("run_id")
);

CREATE INDEX "reconciliation_runs_status_started_at_idx"
  ON "reconciliation_runs"("status", "started_at");
CREATE INDEX "reconciliation_runs_provider_period_from_idx"
  ON "reconciliation_runs"("provider", "period_from");
CREATE INDEX "reconciliation_runs_treasury_account_id_period_from_idx"
  ON "reconciliation_runs"("treasury_account_id", "period_from");

ALTER TABLE "reconciliation_runs"
  ADD CONSTRAINT "reconciliation_runs_treasury_account_id_fkey"
  FOREIGN KEY ("treasury_account_id")
  REFERENCES "treasury_accounts"("treasury_account_id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "reconciliation_runs"
  ADD CONSTRAINT "reconciliation_period_valid"
  CHECK ("period_to" >= "period_from");

ALTER TABLE "reconciliation_runs"
  ADD CONSTRAINT "reconciliation_counts_nonnegative"
  CHECK (
    "records_scanned" >= 0
    AND "records_matched" >= 0
    AND "issue_count" >= 0
  );

-- Exceptions are durable Finance work items rather than log-only warnings.
CREATE TABLE "reconciliation_issues" (
  "issue_id" TEXT NOT NULL,
  "run_id" TEXT NOT NULL,
  "treasury_account_id" TEXT,
  "type" "ReconciliationIssueType" NOT NULL,
  "status" "ReconciliationIssueStatus" NOT NULL DEFAULT 'OPEN',
  "severity" "AuditSeverity" NOT NULL DEFAULT 'WARNING',
  "provider" "TreasuryProvider",
  "internal_reference" VARCHAR(200),
  "external_reference" VARCHAR(200),
  "expected_amount_minor" BIGINT,
  "actual_amount_minor" BIGINT,
  "variance_minor" BIGINT,
  "details" JSONB,
  "resolved_by_admin_id" TEXT,
  "resolved_at" TIMESTAMP(3),
  "resolution_note" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "reconciliation_issues_pkey" PRIMARY KEY ("issue_id")
);

CREATE INDEX "reconciliation_issues_run_id_status_idx"
  ON "reconciliation_issues"("run_id", "status");
CREATE INDEX "reconciliation_issues_type_status_idx"
  ON "reconciliation_issues"("type", "status");
CREATE INDEX "reconciliation_issues_provider_status_idx"
  ON "reconciliation_issues"("provider", "status");
CREATE INDEX "reconciliation_issues_treasury_account_id_status_idx"
  ON "reconciliation_issues"("treasury_account_id", "status");

ALTER TABLE "reconciliation_issues"
  ADD CONSTRAINT "reconciliation_issues_run_id_fkey"
  FOREIGN KEY ("run_id")
  REFERENCES "reconciliation_runs"("run_id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "reconciliation_issues"
  ADD CONSTRAINT "reconciliation_issues_treasury_account_id_fkey"
  FOREIGN KEY ("treasury_account_id")
  REFERENCES "treasury_accounts"("treasury_account_id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
