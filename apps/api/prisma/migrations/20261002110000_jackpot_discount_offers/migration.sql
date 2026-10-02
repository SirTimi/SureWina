-- Phase 1: replace automatic free jackpot-entry issuance for new purchases
-- with a persistent, cycle-scoped discounted jackpot purchase entitlement.
--
-- Historical jackpot_entries and jackpot_accumulation free-entry counters are
-- intentionally retained untouched for auditability.

CREATE TYPE "JackpotDiscountOfferStatus" AS ENUM (
  'AVAILABLE',
  'CLAIMING',
  'CLAIMED',
  'DECLINED',
  'EXPIRED'
);

CREATE TABLE "jackpot_discount_offers" (
  "offer_id" TEXT NOT NULL,
  "buyer_phone" TEXT NOT NULL,
  "buyer_user_id" TEXT,
  "jackpot_draw_id" TEXT NOT NULL,
  "threshold_number" INTEGER NOT NULL,
  "regular_tickets_at_unlock" INTEGER NOT NULL,
  "original_price_ngn" INTEGER NOT NULL,
  "offer_price_ngn" INTEGER NOT NULL,
  "status" "JackpotDiscountOfferStatus" NOT NULL DEFAULT 'AVAILABLE',
  "issued_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expires_at" TIMESTAMP(3) NOT NULL,
  "claimed_at" TIMESTAMP(3),
  "declined_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "jackpot_discount_offers_pkey" PRIMARY KEY ("offer_id")
);

CREATE UNIQUE INDEX "jackpot_discount_offers_buyer_phone_jackpot_draw_id_threshold_number_key"
  ON "jackpot_discount_offers"("buyer_phone", "jackpot_draw_id", "threshold_number");

CREATE INDEX "jackpot_discount_offers_buyer_phone_status_idx"
  ON "jackpot_discount_offers"("buyer_phone", "status");

CREATE INDEX "jackpot_discount_offers_buyer_user_id_idx"
  ON "jackpot_discount_offers"("buyer_user_id");

CREATE INDEX "jackpot_discount_offers_jackpot_draw_id_status_idx"
  ON "jackpot_discount_offers"("jackpot_draw_id", "status");

CREATE INDEX "jackpot_discount_offers_status_expires_at_idx"
  ON "jackpot_discount_offers"("status", "expires_at");

ALTER TABLE "jackpot_discount_offers"
  ADD CONSTRAINT "jackpot_discount_offers_buyer_user_id_fkey"
  FOREIGN KEY ("buyer_user_id")
  REFERENCES "users"("user_id")
  ON DELETE SET NULL
  ON UPDATE CASCADE;

ALTER TABLE "jackpot_discount_offers"
  ADD CONSTRAINT "jackpot_discount_offers_jackpot_draw_id_fkey"
  FOREIGN KEY ("jackpot_draw_id")
  REFERENCES "draws"("draw_id")
  ON DELETE RESTRICT
  ON UPDATE CASCADE;
