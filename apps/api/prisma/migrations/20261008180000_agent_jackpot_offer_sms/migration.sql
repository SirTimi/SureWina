-- Track delivery of an agent-earned jackpot offer notification.
-- NULL preserves pending notices. No changes to historical jackpot entries.
ALTER TABLE "jackpot_discount_offers"
  ADD COLUMN "offer_sms_sent_at" TIMESTAMP(3);

CREATE INDEX "jackpot_discount_offers_offer_sms_sent_at_expires_at_idx"
  ON "jackpot_discount_offers"("offer_sms_sent_at", "expires_at");
