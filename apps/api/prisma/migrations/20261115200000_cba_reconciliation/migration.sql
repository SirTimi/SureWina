-- CreateEnum
CREATE TYPE "CbaReconciliationStatus" AS ENUM ('PASS', 'SHORTFALL', 'MISMATCH', 'INCOMPLETE');

-- CreateTable
CREATE TABLE "cba_reconciliation_runs" (
    "run_id" TEXT NOT NULL,
    "business_date" DATE NOT NULL,
    "status" "CbaReconciliationStatus" NOT NULL,
    "triggered_by" VARCHAR(64) NOT NULL,
    "vault_kobo" BIGINT NOT NULL,
    "owners_kobo" BIGINT NOT NULL,
    "sales_kobo" BIGINT NOT NULL,
    "pending_withdrawals_kobo" BIGINT NOT NULL,
    "uncredited_top_ups_kobo" BIGINT NOT NULL,
    "paid_unsettled_kobo" BIGINT NOT NULL,
    "obligations_kobo" BIGINT NOT NULL,
    "coverage_kobo" BIGINT NOT NULL,
    "unexplained_kobo" BIGINT NOT NULL,
    "expected_pending_kobo" BIGINT NOT NULL,
    "accounts_read" INTEGER NOT NULL,
    "accounts_failed" INTEGER NOT NULL,
    "issues" JSONB NOT NULL,
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cba_reconciliation_runs_pkey" PRIMARY KEY ("run_id")
);

-- CreateIndex
CREATE INDEX "cba_reconciliation_runs_business_date_idx" ON "cba_reconciliation_runs"("business_date");

-- CreateIndex
CREATE INDEX "cba_reconciliation_runs_status_completed_at_idx" ON "cba_reconciliation_runs"("status", "completed_at");
