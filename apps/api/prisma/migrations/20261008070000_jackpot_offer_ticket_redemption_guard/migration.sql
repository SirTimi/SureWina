-- One promotional offer is redeemable for exactly one physical ticket.
-- Nullable column preserves normal purchases and historical free JackpotEntry rows.
-- Backfill earlier promotional tickets before adding the uniqueness guard.
ALTER TABLE "tickets"
  ADD COLUMN "jackpot_discount_offer_id" TEXT;

UPDATE "tickets" AS t
SET "jackpot_discount_offer_id" = p."jackpot_discount_offer_id"
FROM "payment_transactions" AS p
WHERE t."payment_txn_id" = p."txn_id"
  AND p."pricing_context" = 'PROMOTIONAL_JACKPOT'
  AND p."jackpot_discount_offer_id" IS NOT NULL;

UPDATE "tickets" AS t
SET "jackpot_discount_offer_id" = w."jackpot_discount_offer_id"
FROM "wallet_purchases" AS w
WHERE t."wallet_purchase_id" = w."purchase_id"
  AND w."pricing_context" = 'PROMOTIONAL_JACKPOT'
  AND w."jackpot_discount_offer_id" IS NOT NULL;

-- Fails loudly if historic data already contains two tickets for one offer.
CREATE UNIQUE INDEX "tickets_jackpot_discount_offer_id_key"
  ON "tickets"("jackpot_discount_offer_id");

ALTER TABLE "tickets"
  ADD CONSTRAINT "tickets_jackpot_discount_offer_id_fkey"
  FOREIGN KEY ("jackpot_discount_offer_id")
  REFERENCES "jackpot_discount_offers"("offer_id")
  ON DELETE RESTRICT
  ON UPDATE CASCADE;
