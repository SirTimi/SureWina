-- Phase 4: persist purchase pricing context and promotion linkage.
--
-- Normal purchases remain NORMAL. Discounted jackpot purchases are explicitly
-- PROMOTIONAL_JACKPOT and derive price from jackpot_discount_offers.

CREATE TYPE "PurchasePricingContext" AS ENUM (
  'NORMAL',
  'PROMOTIONAL_JACKPOT'
);

ALTER TABLE "payment_transactions"
  ADD COLUMN "pricing_context" "PurchasePricingContext" NOT NULL DEFAULT 'NORMAL',
  ADD COLUMN "jackpot_discount_offer_id" TEXT;

ALTER TABLE "wallet_purchases"
  ADD COLUMN "pricing_context" "PurchasePricingContext" NOT NULL DEFAULT 'NORMAL',
  ADD COLUMN "jackpot_discount_offer_id" TEXT;

CREATE INDEX "payment_transactions_jackpot_discount_offer_id_status_idx"
  ON "payment_transactions"("jackpot_discount_offer_id", "status");

CREATE INDEX "wallet_purchases_jackpot_discount_offer_id_status_idx"
  ON "wallet_purchases"("jackpot_discount_offer_id", "status");

ALTER TABLE "payment_transactions"
  ADD CONSTRAINT "payment_transactions_jackpot_discount_offer_id_fkey"
  FOREIGN KEY ("jackpot_discount_offer_id")
  REFERENCES "jackpot_discount_offers"("offer_id")
  ON DELETE RESTRICT
  ON UPDATE CASCADE;

ALTER TABLE "wallet_purchases"
  ADD CONSTRAINT "wallet_purchases_jackpot_discount_offer_id_fkey"
  FOREIGN KEY ("jackpot_discount_offer_id")
  REFERENCES "jackpot_discount_offers"("offer_id")
  ON DELETE RESTRICT
  ON UPDATE CASCADE;
