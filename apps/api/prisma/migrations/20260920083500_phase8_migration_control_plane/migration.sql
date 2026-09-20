-- Phase 8: migration control plane and legacy hardening.
--
-- This migration intentionally does NOT backfill money.
-- Financial state is moved later by the resumable Phase 8 migration service.

CREATE TYPE "FinancialMigrationKind" AS ENUM (
  'AGENT_WALLET_BALANCE',
  'PAYMENT_COLLECTION',
  'PAYMENT_REFUND',
  'PRIZE_ACCRUAL',
  'AGENT_PRIZE_PAYOUT',
  'REMITTANCE_ACCOUNTING',
  'PRIZE_PAYOUT_HISTORY'
);

CREATE TYPE "FinancialMigrationRunStatus" AS ENUM (
  'PLANNED',
  'RUNNING',
  'COMPLETED',
  'COMPLETED_WITH_EXCEPTIONS',
  'FAILED',
  'FINALIZED'
);

CREATE TYPE "FinancialMigrationItemStatus" AS ENUM (
  'PENDING',
  'APPLIED',
  'SKIPPED',
  'REVIEW_REQUIRED',
  'FAILED'
);

CREATE TABLE "financial_migration_runs" (
  "run_id" TEXT NOT NULL,
  "label" VARCHAR(160) NOT NULL,
  "status" "FinancialMigrationRunStatus" NOT NULL DEFAULT 'PLANNED',
  "created_by" VARCHAR(120),
  "planned_count" INTEGER NOT NULL DEFAULT 0,
  "applied_count" INTEGER NOT NULL DEFAULT 0,
  "skipped_count" INTEGER NOT NULL DEFAULT 0,
  "review_count" INTEGER NOT NULL DEFAULT 0,
  "failed_count" INTEGER NOT NULL DEFAULT 0,
  "started_at" TIMESTAMP(3),
  "completed_at" TIMESTAMP(3),
  "finalized_at" TIMESTAMP(3),
  "notes" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "financial_migration_runs_pkey" PRIMARY KEY ("run_id")
);

CREATE TABLE "financial_migration_items" (
  "item_id" TEXT NOT NULL,
  "run_id" TEXT NOT NULL,
  "kind" "FinancialMigrationKind" NOT NULL,
  "source_type" VARCHAR(100) NOT NULL,
  "source_id" VARCHAR(180) NOT NULL,
  "status" "FinancialMigrationItemStatus" NOT NULL DEFAULT 'PENDING',
  "snapshot" JSONB,
  "result" JSONB,
  "ledger_txn_id" VARCHAR(180),
  "error_message" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "financial_migration_items_pkey" PRIMARY KEY ("item_id")
);

CREATE INDEX "financial_migration_runs_status_created_at_idx"
ON "financial_migration_runs"("status", "created_at");

CREATE UNIQUE INDEX "financial_migration_items_run_id_kind_source_type_source_id_key"
ON "financial_migration_items"("run_id", "kind", "source_type", "source_id");

CREATE INDEX "financial_migration_items_run_id_status_idx"
ON "financial_migration_items"("run_id", "status");

CREATE INDEX "financial_migration_items_kind_status_idx"
ON "financial_migration_items"("kind", "status");

CREATE INDEX "financial_migration_items_source_type_source_id_idx"
ON "financial_migration_items"("source_type", "source_id");

ALTER TABLE "financial_migration_items"
ADD CONSTRAINT "financial_migration_items_run_id_fkey"
FOREIGN KEY ("run_id")
REFERENCES "financial_migration_runs"("run_id")
ON DELETE RESTRICT
ON UPDATE CASCADE;

ALTER TABLE "financial_migration_runs"
ADD CONSTRAINT "financial_migration_run_counts_nonnegative"
CHECK (
  "planned_count" >= 0
  AND "applied_count" >= 0
  AND "skipped_count" >= 0
  AND "review_count" >= 0
  AND "failed_count" >= 0
);

-- ---------------------------------------------------------------------------
-- Inactive Paystack rail
-- ---------------------------------------------------------------------------
-- Historical PAYSTACK rows remain valid and may still be updated by migration
-- or support workflows. New financial rows may not select PAYSTACK.

CREATE OR REPLACE FUNCTION phase8_block_new_paystack_money()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW."gateway"::text = 'PAYSTACK' THEN
      RAISE EXCEPTION
        'PAYSTACK is a legacy-only gateway and cannot be used for new money rows.'
        USING ERRCODE = '55000';
    END IF;
  ELSIF TG_OP = 'UPDATE' THEN
    IF NEW."gateway" IS DISTINCT FROM OLD."gateway"
       AND NEW."gateway"::text = 'PAYSTACK' THEN
      RAISE EXCEPTION
        'PAYSTACK is a legacy-only gateway and cannot be selected.'
        USING ERRCODE = '55000';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER payment_transactions_no_new_paystack
BEFORE INSERT OR UPDATE OF "gateway"
ON "payment_transactions"
FOR EACH ROW
EXECUTE FUNCTION phase8_block_new_paystack_money();

CREATE TRIGGER wallet_fundings_no_new_paystack
BEFORE INSERT OR UPDATE OF "gateway"
ON "wallet_fundings"
FOR EACH ROW
EXECUTE FUNCTION phase8_block_new_paystack_money();

-- ---------------------------------------------------------------------------
-- Legacy integer agent wallet
-- ---------------------------------------------------------------------------
-- Existing non-zero values are allowed to exist until the Phase 8 backfill
-- moves them to the ledger wallet. No code may create/increment a new legacy
-- balance. The migration is allowed to move an existing value to zero.

CREATE OR REPLACE FUNCTION phase8_lock_legacy_agent_wallet()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW."wallet_balance_ngn" <> 0 THEN
      RAISE EXCEPTION
        'Legacy agent.wallet_balance_ngn is frozen; use the ledger wallet.'
        USING ERRCODE = '55000';
    END IF;
  ELSIF NEW."wallet_balance_ngn" IS DISTINCT FROM OLD."wallet_balance_ngn"
        AND NEW."wallet_balance_ngn" <> 0 THEN
    RAISE EXCEPTION
      'Legacy agent.wallet_balance_ngn may only be migrated to zero.'
      USING ERRCODE = '55000';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER agents_legacy_wallet_frozen
BEFORE INSERT OR UPDATE OF "wallet_balance_ngn"
ON "agents"
FOR EACH ROW
EXECUTE FUNCTION phase8_lock_legacy_agent_wallet();

-- ---------------------------------------------------------------------------
-- Write-once ledger links + financial identity
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION phase8_payment_financial_identity_immutable()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD."collection_ledger_txn_id" IS NOT NULL THEN
    IF NEW."collection_ledger_txn_id" IS DISTINCT FROM OLD."collection_ledger_txn_id"
       OR NEW."gateway_reference" IS DISTINCT FROM OLD."gateway_reference"
       OR NEW."gateway" IS DISTINCT FROM OLD."gateway"
       OR NEW."amount_ngn" IS DISTINCT FROM OLD."amount_ngn"
       OR NEW."channel" IS DISTINCT FROM OLD."channel"
       OR NEW."agent_id" IS DISTINCT FROM OLD."agent_id"
       OR NEW."purchase_draw_id" IS DISTINCT FROM OLD."purchase_draw_id" THEN
      RAISE EXCEPTION
        'Ledger-backed payment financial identity cannot be changed.'
        USING ERRCODE = '55000';
    END IF;
  END IF;

  IF OLD."refund_accrual_ledger_txn_id" IS NOT NULL
     AND NEW."refund_accrual_ledger_txn_id" IS DISTINCT FROM OLD."refund_accrual_ledger_txn_id" THEN
    RAISE EXCEPTION
      'Payment refund accrual ledger link is immutable.'
      USING ERRCODE = '55000';
  END IF;

  IF OLD."refund_settlement_ledger_txn_id" IS NOT NULL
     AND NEW."refund_settlement_ledger_txn_id" IS DISTINCT FROM OLD."refund_settlement_ledger_txn_id" THEN
    RAISE EXCEPTION
      'Payment refund settlement ledger link is immutable.'
      USING ERRCODE = '55000';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER payment_financial_identity_immutable
BEFORE UPDATE
ON "payment_transactions"
FOR EACH ROW
EXECUTE FUNCTION phase8_payment_financial_identity_immutable();

CREATE OR REPLACE FUNCTION phase8_wallet_funding_ledger_link_immutable()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD."ledger_txn_id" IS NOT NULL
     AND (
       NEW."ledger_txn_id" IS DISTINCT FROM OLD."ledger_txn_id"
       OR NEW."wallet_id" IS DISTINCT FROM OLD."wallet_id"
       OR NEW."gateway_reference" IS DISTINCT FROM OLD."gateway_reference"
       OR NEW."gateway" IS DISTINCT FROM OLD."gateway"
       OR NEW."amount_ngn" IS DISTINCT FROM OLD."amount_ngn"
       OR NEW."currency" IS DISTINCT FROM OLD."currency"
     ) THEN
    RAISE EXCEPTION
      'Ledger-backed wallet funding financial identity cannot be changed.'
      USING ERRCODE = '55000';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER wallet_funding_ledger_identity_immutable
BEFORE UPDATE
ON "wallet_fundings"
FOR EACH ROW
EXECUTE FUNCTION phase8_wallet_funding_ledger_link_immutable();

CREATE OR REPLACE FUNCTION phase8_remittance_financial_identity_immutable()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD."commission_ledger_txn_id" IS NOT NULL
     OR OLD."settlement_ledger_txn_id" IS NOT NULL
     OR OLD."wallet_credit_ledger_txn_id" IS NOT NULL THEN
    IF NEW."agent_id" IS DISTINCT FROM OLD."agent_id"
       OR NEW."period_date" IS DISTINCT FROM OLD."period_date"
       OR NEW."gross_sales_ngn" IS DISTINCT FROM OLD."gross_sales_ngn"
       OR NEW."commission_ngn" IS DISTINCT FROM OLD."commission_ngn"
       OR NEW."amount_due_ngn" IS DISTINCT FROM OLD."amount_due_ngn"
       OR NEW."ticket_count" IS DISTINCT FROM OLD."ticket_count"
       OR NEW."winnings_paid_out_ngn" IS DISTINCT FROM OLD."winnings_paid_out_ngn" THEN
      RAISE EXCEPTION
        'Ledger-backed remittance financial identity cannot be changed.'
        USING ERRCODE = '55000';
    END IF;
  END IF;

  IF OLD."commission_ledger_txn_id" IS NOT NULL
     AND NEW."commission_ledger_txn_id" IS DISTINCT FROM OLD."commission_ledger_txn_id" THEN
    RAISE EXCEPTION
      'Remittance commission ledger link is immutable.'
      USING ERRCODE = '55000';
  END IF;

  IF OLD."settlement_ledger_txn_id" IS NOT NULL
     AND NEW."settlement_ledger_txn_id" IS DISTINCT FROM OLD."settlement_ledger_txn_id" THEN
    RAISE EXCEPTION
      'Remittance settlement ledger link is immutable.'
      USING ERRCODE = '55000';
  END IF;

  IF OLD."wallet_credit_ledger_txn_id" IS NOT NULL
     AND NEW."wallet_credit_ledger_txn_id" IS DISTINCT FROM OLD."wallet_credit_ledger_txn_id" THEN
    RAISE EXCEPTION
      'Remittance wallet-credit ledger link is immutable.'
      USING ERRCODE = '55000';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER remittance_financial_identity_immutable
BEFORE UPDATE
ON "remittances"
FOR EACH ROW
EXECUTE FUNCTION phase8_remittance_financial_identity_immutable();

CREATE OR REPLACE FUNCTION phase8_prize_ledger_identity_immutable()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD."prize_accrual_ledger_txn_id" IS NOT NULL THEN
    IF NEW."prize_accrual_ledger_txn_id" IS DISTINCT FROM OLD."prize_accrual_ledger_txn_id"
       OR NEW."gross_prize_value_ngn" IS DISTINCT FROM OLD."gross_prize_value_ngn"
       OR NEW."wht_amount_ngn" IS DISTINCT FROM OLD."wht_amount_ngn"
       OR NEW."net_prize_value_ngn" IS DISTINCT FROM OLD."net_prize_value_ngn" THEN
      RAISE EXCEPTION
        'Ledger-backed prize entitlement cannot be changed.'
        USING ERRCODE = '55000';
    END IF;
  END IF;

  IF OLD."agent_payout_ledger_txn_id" IS NOT NULL THEN
    IF NEW."agent_payout_ledger_txn_id" IS DISTINCT FROM OLD."agent_payout_ledger_txn_id"
       OR NEW."paid_by_agent_id" IS DISTINCT FROM OLD."paid_by_agent_id"
       OR NEW."paid_by_agent_at" IS DISTINCT FROM OLD."paid_by_agent_at" THEN
      RAISE EXCEPTION
        'Ledger-backed agent prize payout identity cannot be changed.'
        USING ERRCODE = '55000';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER prize_claim_ledger_identity_immutable
BEFORE UPDATE
ON "prize_claims"
FOR EACH ROW
EXECUTE FUNCTION phase8_prize_ledger_identity_immutable();
