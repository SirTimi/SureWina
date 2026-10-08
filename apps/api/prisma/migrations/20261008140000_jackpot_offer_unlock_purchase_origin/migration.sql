-- Phase 7: associate each newly unlocked offer with the purchase that
-- crossed its 10-ticket threshold. These references are provenance only.
-- Existing offers stay valid with NULL source identifiers.
ALTER TABLE "jackpot_discount_offers"
  ADD COLUMN "unlocked_by_payment_txn_id" TEXT,
  ADD COLUMN "unlocked_by_wallet_purchase_id" TEXT;

CREATE INDEX "jackpot_discount_offers_unlocked_by_payment_txn_id_idx"
  ON "jackpot_discount_offers"("unlocked_by_payment_txn_id");

CREATE INDEX "jackpot_discount_offers_unlocked_by_wallet_purchase_id_idx"
  ON "jackpot_discount_offers"("unlocked_by_wallet_purchase_id");
