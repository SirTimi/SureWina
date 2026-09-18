-- CreateEnum
CREATE TYPE "WalletPurchaseStatus" AS ENUM ('PENDING', 'COMPLETED', 'REVERSED');

-- DropForeignKey
ALTER TABLE "tickets" DROP CONSTRAINT "tickets_payment_txn_id_fkey";

-- AlterTable
ALTER TABLE "tickets" ADD COLUMN     "wallet_purchase_id" TEXT,
ALTER COLUMN "payment_txn_id" DROP NOT NULL;

-- CreateTable
CREATE TABLE "wallet_purchases" (
    "purchase_id" TEXT NOT NULL,
    "idempotency_key" VARCHAR(200) NOT NULL,
    "wallet_id" TEXT NOT NULL,
    "buyer_user_id" TEXT NOT NULL,
    "buyer_phone" TEXT NOT NULL,
    "draw_id" TEXT NOT NULL,
    "state_of_play_code" VARCHAR(32) NOT NULL,
    "ticket_count" INTEGER NOT NULL,
    "amount_ngn" INTEGER NOT NULL,
    "status" "WalletPurchaseStatus" NOT NULL DEFAULT 'PENDING',
    "hold_id" TEXT,
    "completed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "walletHoldHoldId" TEXT,

    CONSTRAINT "wallet_purchases_pkey" PRIMARY KEY ("purchase_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "wallet_purchases_idempotency_key_key" ON "wallet_purchases"("idempotency_key");

-- CreateIndex
CREATE UNIQUE INDEX "wallet_purchases_hold_id_key" ON "wallet_purchases"("hold_id");

-- CreateIndex
CREATE INDEX "wallet_purchases_buyer_user_id_created_at_idx" ON "wallet_purchases"("buyer_user_id", "created_at");

-- CreateIndex
CREATE INDEX "wallet_purchases_wallet_id_created_at_idx" ON "wallet_purchases"("wallet_id", "created_at");

-- CreateIndex
CREATE INDEX "wallet_purchases_draw_id_status_idx" ON "wallet_purchases"("draw_id", "status");

-- CreateIndex
CREATE INDEX "wallet_purchases_status_created_at_idx" ON "wallet_purchases"("status", "created_at");

-- CreateIndex
CREATE INDEX "tickets_wallet_purchase_id_idx" ON "tickets"("wallet_purchase_id");

-- AddForeignKey
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_payment_txn_id_fkey" FOREIGN KEY ("payment_txn_id") REFERENCES "payment_transactions"("txn_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_wallet_purchase_id_fkey" FOREIGN KEY ("wallet_purchase_id") REFERENCES "wallet_purchases"("purchase_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wallet_purchases" ADD CONSTRAINT "wallet_purchases_wallet_id_fkey" FOREIGN KEY ("wallet_id") REFERENCES "wallets"("wallet_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wallet_purchases" ADD CONSTRAINT "wallet_purchases_buyer_user_id_fkey" FOREIGN KEY ("buyer_user_id") REFERENCES "users"("user_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wallet_purchases" ADD CONSTRAINT "wallet_purchases_draw_id_fkey" FOREIGN KEY ("draw_id") REFERENCES "draws"("draw_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wallet_purchases" ADD CONSTRAINT "wallet_purchases_hold_id_fkey" FOREIGN KEY ("hold_id") REFERENCES "wallet_holds"("hold_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wallet_purchases" ADD CONSTRAINT "wallet_purchases_walletHoldHoldId_fkey" FOREIGN KEY ("walletHoldHoldId") REFERENCES "wallet_holds"("hold_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ============================================================
-- PHASE 5 WALLET PURCHASE INVARIANTS
-- ============================================================

ALTER TABLE "wallet_purchases"
ADD CONSTRAINT "wallet_purchase_amount_positive"
CHECK ("amount_ngn" > 0);

ALTER TABLE "wallet_purchases"
ADD CONSTRAINT "wallet_purchase_ticket_count_positive"
CHECK ("ticket_count" > 0);

ALTER TABLE "wallet_purchases"
ADD CONSTRAINT "wallet_purchase_state_code_nonempty"
CHECK (char_length(trim("state_of_play_code")) > 0);

ALTER TABLE "wallet_purchases"
ADD CONSTRAINT "wallet_purchase_completion_consistency"
CHECK (
  (
    "status"::text = 'COMPLETED'
    AND "hold_id" IS NOT NULL
    AND "completed_at" IS NOT NULL
  )
  OR
  (
    "status"::text <> 'COMPLETED'
  )
);

-- Every paid ticket must originate from exactly one purchase source:
-- legacy PSP/agent PaymentTransaction OR WalletPurchase.
ALTER TABLE "tickets"
ADD CONSTRAINT "ticket_exactly_one_purchase_source"
CHECK (
  (
    CASE
      WHEN "payment_txn_id" IS NOT NULL THEN 1
      ELSE 0
    END
  )
  +
  (
    CASE
      WHEN "wallet_purchase_id" IS NOT NULL THEN 1
      ELSE 0
    END
  )
  = 1
);

CREATE OR REPLACE FUNCTION surewina_protect_wallet_purchase_identity()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF
    OLD."idempotency_key" IS DISTINCT FROM NEW."idempotency_key"
    OR OLD."wallet_id" IS DISTINCT FROM NEW."wallet_id"
    OR OLD."buyer_user_id" IS DISTINCT FROM NEW."buyer_user_id"
    OR OLD."buyer_phone" IS DISTINCT FROM NEW."buyer_phone"
    OR OLD."draw_id" IS DISTINCT FROM NEW."draw_id"
    OR OLD."state_of_play_code" IS DISTINCT FROM NEW."state_of_play_code"
    OR OLD."ticket_count" IS DISTINCT FROM NEW."ticket_count"
    OR OLD."amount_ngn" IS DISTINCT FROM NEW."amount_ngn"
  THEN
    RAISE EXCEPTION
      'Wallet purchase financial identity cannot be changed.'
      USING ERRCODE = '55000';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER wallet_purchase_identity_immutable
BEFORE UPDATE
ON "wallet_purchases"
FOR EACH ROW
EXECUTE FUNCTION surewina_protect_wallet_purchase_identity();

CREATE OR REPLACE FUNCTION surewina_validate_completed_wallet_purchase()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  hold_status TEXT;
  hold_wallet_id TEXT;
  hold_amount BIGINT;
  hold_reference_type TEXT;
  hold_reference_id TEXT;

  actual_ticket_count BIGINT;
  actual_ticket_total BIGINT;
BEGIN
  IF NEW."status"::text <> 'COMPLETED' THEN
    RETURN NEW;
  END IF;

  IF NEW."hold_id" IS NULL THEN
    RAISE EXCEPTION
      'Completed wallet purchase must have a hold.'
      USING ERRCODE = '23514';
  END IF;

  SELECT
    "status"::text,
    "wallet_id",
    "amount_ngn",
    "reference_type",
    "reference_id"
  INTO
    hold_status,
    hold_wallet_id,
    hold_amount,
    hold_reference_type,
    hold_reference_id
  FROM "wallet_holds"
  WHERE "hold_id" = NEW."hold_id";

  IF NOT FOUND THEN
    RAISE EXCEPTION
      'Wallet purchase hold does not exist.'
      USING ERRCODE = '23514';
  END IF;

  IF
    hold_status <> 'CAPTURED'
    OR hold_wallet_id <> NEW."wallet_id"
    OR hold_amount <> NEW."amount_ngn"
    OR hold_reference_type <> 'WalletPurchase'
    OR hold_reference_id <> NEW."purchase_id"
  THEN
    RAISE EXCEPTION
      'Wallet purchase hold is inconsistent.'
      USING ERRCODE = '23514';
  END IF;

  SELECT
    COUNT(*),
    COALESCE(SUM("face_value_ngn"), 0)
  INTO
    actual_ticket_count,
    actual_ticket_total
  FROM "tickets"
  WHERE "wallet_purchase_id" = NEW."purchase_id";

  IF actual_ticket_count <> NEW."ticket_count" THEN
    RAISE EXCEPTION
      'Wallet purchase ticket count mismatch.'
      USING ERRCODE = '23514';
  END IF;

  IF actual_ticket_total <> NEW."amount_ngn" THEN
    RAISE EXCEPTION
      'Wallet purchase ticket value mismatch.'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

CREATE CONSTRAINT TRIGGER wallet_purchase_integrity
AFTER INSERT OR UPDATE
ON "wallet_purchases"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
EXECUTE FUNCTION surewina_validate_completed_wallet_purchase();