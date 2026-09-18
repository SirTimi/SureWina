/*
  Warnings:

  - A unique constraint covering the columns `[prize_accrual_ledger_txn_id]`
    on the table `prize_claims` will be added.
    Existing rows receive NULL for this new nullable column, so multiple
    existing claims do not conflict with this unique index.
*/

-- ============================================================
-- PHASE 6: PAYOUT ARCHITECTURE
-- ============================================================

-- ------------------------------------------------------------
-- LEDGER ACCOUNT PURPOSE
-- ------------------------------------------------------------

ALTER TYPE "LedgerAccountPurpose"
ADD VALUE 'PAYOUT_CLEARING';


-- ------------------------------------------------------------
-- PRIZE CLAIM LEDGER LINK
-- ------------------------------------------------------------

ALTER TABLE "prize_claims"
ADD COLUMN "prize_accrual_ledger_txn_id" TEXT;


-- ------------------------------------------------------------
-- PRIZE PAYOUT ATTEMPTS
-- ------------------------------------------------------------

CREATE TABLE "prize_payout_attempts" (
    "attempt_id" TEXT NOT NULL,
    "claim_id" TEXT NOT NULL,
    "attempt_number" INTEGER NOT NULL,

    "provider" VARCHAR(32) NOT NULL,
    "idempotency_key" VARCHAR(50) NOT NULL,

    "amount_ngn" INTEGER NOT NULL,
    "currency" VARCHAR(3) NOT NULL DEFAULT 'NGN',

    "status" "PrizePayoutStatus" NOT NULL DEFAULT 'REQUESTED',

    "provider_reference" VARCHAR(120),
    "provider_transaction_id" VARCHAR(120),

    "raw_status" VARCHAR(120),
    "failure_reason" TEXT,

    "destination_bank_code" VARCHAR(32) NOT NULL,
    "destination_account_last4" VARCHAR(4) NOT NULL,
    "destination_account_name_hash" VARCHAR(64) NOT NULL,

    "initiated_by_admin_id" TEXT NOT NULL,

    "initiated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_checked_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),

    "payout_ledger_txn_id" TEXT,
    "reversal_ledger_txn_id" TEXT,

    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "prize_payout_attempts_pkey"
        PRIMARY KEY ("attempt_id")
);


-- ============================================================
-- INDEXES / UNIQUENESS
-- ============================================================

CREATE UNIQUE INDEX
"prize_payout_attempts_idempotency_key_key"
ON "prize_payout_attempts"("idempotency_key");

CREATE UNIQUE INDEX
"prize_payout_attempts_payout_ledger_txn_id_key"
ON "prize_payout_attempts"("payout_ledger_txn_id");

CREATE UNIQUE INDEX
"prize_payout_attempts_reversal_ledger_txn_id_key"
ON "prize_payout_attempts"("reversal_ledger_txn_id");

CREATE INDEX
"prize_payout_attempts_claim_id_created_at_idx"
ON "prize_payout_attempts"("claim_id", "created_at");

CREATE INDEX
"prize_payout_attempts_provider_status_idx"
ON "prize_payout_attempts"("provider", "status");

CREATE INDEX
"prize_payout_attempts_status_initiated_at_idx"
ON "prize_payout_attempts"("status", "initiated_at");

CREATE UNIQUE INDEX
"prize_payout_attempts_claim_id_attempt_number_key"
ON "prize_payout_attempts"("claim_id", "attempt_number");

CREATE UNIQUE INDEX
"prize_payout_attempts_provider_provider_reference_key"
ON "prize_payout_attempts"("provider", "provider_reference");

CREATE UNIQUE INDEX
"prize_claims_prize_accrual_ledger_txn_id_key"
ON "prize_claims"("prize_accrual_ledger_txn_id");


-- ============================================================
-- FOREIGN KEYS
-- ============================================================

ALTER TABLE "prize_claims"
ADD CONSTRAINT "prize_claims_prize_accrual_ledger_txn_id_fkey"
FOREIGN KEY ("prize_accrual_ledger_txn_id")
REFERENCES "ledger_transactions"("ledger_txn_id")
ON DELETE RESTRICT
ON UPDATE CASCADE;


ALTER TABLE "prize_payout_attempts"
ADD CONSTRAINT "prize_payout_attempts_claim_id_fkey"
FOREIGN KEY ("claim_id")
REFERENCES "prize_claims"("claim_id")
ON DELETE RESTRICT
ON UPDATE CASCADE;


ALTER TABLE "prize_payout_attempts"
ADD CONSTRAINT "prize_payout_attempts_payout_ledger_txn_id_fkey"
FOREIGN KEY ("payout_ledger_txn_id")
REFERENCES "ledger_transactions"("ledger_txn_id")
ON DELETE RESTRICT
ON UPDATE CASCADE;


ALTER TABLE "prize_payout_attempts"
ADD CONSTRAINT "prize_payout_attempts_reversal_ledger_txn_id_fkey"
FOREIGN KEY ("reversal_ledger_txn_id")
REFERENCES "ledger_transactions"("ledger_txn_id")
ON DELETE RESTRICT
ON UPDATE CASCADE;


-- ============================================================
-- PAYOUT ATTEMPT BASIC INVARIANTS
-- ============================================================

ALTER TABLE "prize_payout_attempts"
ADD CONSTRAINT "prize_payout_attempt_amount_positive"
CHECK (
    "amount_ngn" > 0
);


ALTER TABLE "prize_payout_attempts"
ADD CONSTRAINT "prize_payout_attempt_number_positive"
CHECK (
    "attempt_number" > 0
);


ALTER TABLE "prize_payout_attempts"
ADD CONSTRAINT "prize_payout_attempt_currency"
CHECK (
    "currency" = 'NGN'
);


ALTER TABLE "prize_payout_attempts"
ADD CONSTRAINT "prize_payout_account_last4"
CHECK (
    "destination_account_last4" ~ '^[0-9]{4}$'
);


ALTER TABLE "prize_payout_attempts"
ADD CONSTRAINT "prize_payout_account_name_hash"
CHECK (
    "destination_account_name_hash" ~ '^[a-f0-9]{64}$'
);


ALTER TABLE "prize_payout_attempts"
ADD CONSTRAINT "prize_payout_provider_nonempty"
CHECK (
    char_length(trim("provider")) > 0
);


ALTER TABLE "prize_payout_attempts"
ADD CONSTRAINT "prize_payout_idempotency_format"
CHECK (
    char_length("idempotency_key") BETWEEN 16 AND 50
    AND "idempotency_key" ~ '^[a-z0-9_-]+$'
);


-- ============================================================
-- IMMUTABLE PAYOUT FINANCIAL IDENTITY
-- ============================================================

CREATE OR REPLACE FUNCTION
surewina_protect_prize_payout_attempt_identity()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    IF
        OLD."claim_id" IS DISTINCT FROM NEW."claim_id"
        OR OLD."attempt_number" IS DISTINCT FROM NEW."attempt_number"
        OR OLD."provider" IS DISTINCT FROM NEW."provider"
        OR OLD."idempotency_key" IS DISTINCT FROM NEW."idempotency_key"
        OR OLD."amount_ngn" IS DISTINCT FROM NEW."amount_ngn"
        OR OLD."currency" IS DISTINCT FROM NEW."currency"
        OR OLD."destination_bank_code"
            IS DISTINCT FROM NEW."destination_bank_code"
        OR OLD."destination_account_last4"
            IS DISTINCT FROM NEW."destination_account_last4"
        OR OLD."destination_account_name_hash"
            IS DISTINCT FROM NEW."destination_account_name_hash"
    THEN
        RAISE EXCEPTION
            'Prize payout attempt financial identity cannot be changed.'
            USING ERRCODE = '55000';
    END IF;

    RETURN NEW;
END;
$$;


CREATE TRIGGER
prize_payout_attempt_identity_immutable
BEFORE UPDATE
ON "prize_payout_attempts"
FOR EACH ROW
EXECUTE FUNCTION
surewina_protect_prize_payout_attempt_identity();


-- ============================================================
-- PAYOUT STATE / LEDGER CONSISTENCY
-- ============================================================

/*
 * Valid financial states:
 *
 * 1. REQUESTED / SUBMITTED / PROCESSING / UNKNOWN / FAILED
 *
 *    No payout ledger transaction exists yet.
 *
 *
 * 2. SUCCEEDED
 *
 *    Provider success has been independently confirmed.
 *    The payout ledger transaction must exist.
 *
 *
 * 3. REVERSED before SureWina ever recorded SUCCEEDED
 *
 *    payout_ledger_txn_id   = NULL
 *    reversal_ledger_txn_id = NULL
 *
 *
 * 4. SUCCEEDED then REVERSED
 *
 *    Both the original payout journal and its reversal exist.
 */

ALTER TABLE "prize_payout_attempts"
ADD CONSTRAINT "prize_payout_attempt_state_consistency"
CHECK (
    (
        "status"::text = 'SUCCEEDED'
        AND "payout_ledger_txn_id" IS NOT NULL
        AND "reversal_ledger_txn_id" IS NULL
        AND "completed_at" IS NOT NULL
    )

    OR

    (
        "status"::text = 'REVERSED'
        AND "completed_at" IS NOT NULL
        AND (
            (
                "payout_ledger_txn_id" IS NULL
                AND "reversal_ledger_txn_id" IS NULL
            )
            OR
            (
                "payout_ledger_txn_id" IS NOT NULL
                AND "reversal_ledger_txn_id" IS NOT NULL
            )
        )
    )

    OR

    (
        "status"::text NOT IN ('SUCCEEDED', 'REVERSED')
        AND "payout_ledger_txn_id" IS NULL
        AND "reversal_ledger_txn_id" IS NULL
        AND "completed_at" IS NULL
    )
);