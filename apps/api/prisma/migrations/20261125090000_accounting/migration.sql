-- Phase 3: accounting periods (month close with a posting lock) and the
-- mapping to the accounting consultant's chart of accounts.

CREATE TYPE "AccountingPeriodStatus" AS ENUM ('OPEN', 'CLOSE_PROPOSED', 'CLOSED');

CREATE TABLE "accounting_periods" (
    "period" VARCHAR(7) NOT NULL,
    "status" "AccountingPeriodStatus" NOT NULL DEFAULT 'OPEN',
    "proposed_by" TEXT,
    "proposed_at" TIMESTAMP(3),
    "closed_by" TEXT,
    "closed_at" TIMESTAMP(3),
    "trial_balance" JSONB,
    "snapshot_hash" VARCHAR(64),
    "close_count" INTEGER NOT NULL DEFAULT 0,
    "reopened_by" TEXT,
    "reopened_at" TIMESTAMP(3),
    "reopen_reason" VARCHAR(500),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "accounting_periods_pkey" PRIMARY KEY ("period"),
    CONSTRAINT "accounting_periods_period_check" CHECK ("period" ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
    -- A closed month always has its frozen trial balance, who and when.
    CONSTRAINT "accounting_periods_closed_check" CHECK (
        "status" <> 'CLOSED' OR ("closed_by" IS NOT NULL AND "closed_at" IS NOT NULL AND "trial_balance" IS NOT NULL AND "snapshot_hash" IS NOT NULL)
    ),
    -- The approver is never the person who proposed the close.
    CONSTRAINT "accounting_periods_dual_control_check" CHECK (
        "status" <> 'CLOSED' OR "closed_by" IS DISTINCT FROM "proposed_by"
    )
);

CREATE TABLE "gl_account_mappings" (
    "internal_key" VARCHAR(80) NOT NULL,
    "gl_code" VARCHAR(40),
    "gl_name" VARCHAR(120),
    "pending_gl_code" VARCHAR(40),
    "pending_gl_name" VARCHAR(120),
    "pending_proposed_by" TEXT,
    "pending_proposed_at" TIMESTAMP(3),
    "approved_by" TEXT,
    "approved_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "gl_account_mappings_pkey" PRIMARY KEY ("internal_key")
);

-- The posting lock. Nothing may be posted to the ledger with a date in a
-- closed month (Nigerian time), whatever writes it. Corrections go in the
-- current month.
CREATE FUNCTION "ledger_refuse_closed_period"() RETURNS trigger AS $$
DECLARE
    month TEXT := to_char(NEW."occurred_at" AT TIME ZONE 'UTC' AT TIME ZONE 'Africa/Lagos', 'YYYY-MM');
BEGIN
    IF EXISTS (SELECT 1 FROM "accounting_periods" WHERE "period" = month AND "status" = 'CLOSED') THEN
        RAISE EXCEPTION 'Accounting period % is closed: post this in the current month instead', month
            USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "ledger_transactions_closed_period"
    BEFORE INSERT OR UPDATE OF "occurred_at" ON "ledger_transactions"
    FOR EACH ROW EXECUTE FUNCTION "ledger_refuse_closed_period"();
