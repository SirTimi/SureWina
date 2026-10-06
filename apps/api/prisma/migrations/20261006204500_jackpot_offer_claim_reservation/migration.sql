-- Phase 3: explicit reservation timestamp for discounted jackpot offers.
--
-- CLAIMING is a temporary reservation state. claiming_at lets the API release
-- abandoned reservations without abusing updated_at or claimed_at.

ALTER TABLE "jackpot_discount_offers"
  ADD COLUMN "claiming_at" TIMESTAMP(3);

CREATE INDEX "jackpot_discount_offers_status_claiming_at_idx"
  ON "jackpot_discount_offers"("status", "claiming_at");
