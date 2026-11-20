-- Prize pools, jackpot stages, per-winner records and the uncollected prizes ledger.

-- CreateEnum
CREATE TYPE "DrawPrizeModel" AS ENUM ('SINGLE', 'POOL', 'STAGES');
CREATE TYPE "PoolRevenueBasis" AS ENUM ('GROSS', 'NET_OF_COMMISSION');
CREATE TYPE "RetainedPrizeKind" AS ENUM ('ROUNDING', 'UNAWARDED', 'UNCLAIMED');

-- Draw: prize model and pool settings. Every existing draw stays SINGLE.
ALTER TABLE "draws"
    ADD COLUMN "prize_model" "DrawPrizeModel" NOT NULL DEFAULT 'SINGLE',
    ADD COLUMN "pool_payout_bp" INTEGER,
    ADD COLUMN "pool_minimum_ngn" INTEGER,
    ADD COLUMN "pool_revenue_basis" "PoolRevenueBasis",
    ADD COLUMN "prize_config_locked_at" TIMESTAMP(3);

-- DrawResult: pool figures and the integrity certificate.
ALTER TABLE "draw_results"
    ADD COLUMN "prize_model" "DrawPrizeModel" NOT NULL DEFAULT 'SINGLE',
    ADD COLUMN "eligible_revenue_ngn" INTEGER,
    ADD COLUMN "prize_pool_ngn" INTEGER,
    ADD COLUMN "funding_shortfall_ngn" INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN "retained_ngn" INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN "total_winners" INTEGER NOT NULL DEFAULT 1,
    ADD COLUMN "certificate" JSON;

-- CreateTable
CREATE TABLE "draw_prize_tiers" (
    "tier_id" TEXT NOT NULL,
    "draw_id" TEXT NOT NULL,
    "tier_no" INTEGER NOT NULL,
    "name" VARCHAR(60) NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "allocation_bp" INTEGER,
    "winner_count" INTEGER,
    "prize_per_winner_ngn" INTEGER NOT NULL,
    "prize_description" VARCHAR(200),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "draw_prize_tiers_pkey" PRIMARY KEY ("tier_id"),
    CONSTRAINT "draw_prize_tiers_tier_no_check" CHECK ("tier_no" BETWEEN 1 AND 3),
    CONSTRAINT "draw_prize_tiers_allocation_check" CHECK ("allocation_bp" IS NULL OR "allocation_bp" BETWEEN 1 AND 10000),
    CONSTRAINT "draw_prize_tiers_winner_count_check" CHECK ("winner_count" IS NULL OR "winner_count" >= 1),
    CONSTRAINT "draw_prize_tiers_prize_check" CHECK ("prize_per_winner_ngn" >= 1)
);

CREATE TABLE "draw_winners" (
    "winner_id" TEXT NOT NULL,
    "draw_id" TEXT NOT NULL,
    "result_id" TEXT NOT NULL,
    "tier_no" INTEGER NOT NULL,
    "tier_name" VARCHAR(60) NOT NULL,
    "pick_index" INTEGER NOT NULL,
    "unit_id" TEXT NOT NULL,
    "ticket_id" TEXT,
    "entry_id" TEXT,
    "buyer_phone" TEXT NOT NULL,
    "prize_ngn" INTEGER NOT NULL,
    "prize_description" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "draw_winners_pkey" PRIMARY KEY ("winner_id")
);

CREATE TABLE "retained_prizes" (
    "retained_id" TEXT NOT NULL,
    "draw_id" TEXT NOT NULL,
    "kind" "RetainedPrizeKind" NOT NULL,
    "amount_ngn" INTEGER NOT NULL,
    "tier_no" INTEGER,
    "claim_id" TEXT,
    "note" TEXT,
    "recorded_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "retained_prizes_pkey" PRIMARY KEY ("retained_id"),
    CONSTRAINT "retained_prizes_amount_check" CHECK ("amount_ngn" > 0)
);

-- PrizeClaim: one claim per winner (was one per draw result).
DROP INDEX "prize_claims_draw_result_id_key";
ALTER TABLE "prize_claims" ADD COLUMN "draw_winner_id" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "draw_prize_tiers_draw_id_tier_no_key" ON "draw_prize_tiers"("draw_id", "tier_no");
CREATE UNIQUE INDEX "draw_winners_draw_id_unit_id_key" ON "draw_winners"("draw_id", "unit_id");
CREATE UNIQUE INDEX "draw_winners_draw_id_pick_index_key" ON "draw_winners"("draw_id", "pick_index");
CREATE INDEX "draw_winners_buyer_phone_idx" ON "draw_winners"("buyer_phone");
CREATE UNIQUE INDEX "retained_prizes_claim_id_key" ON "retained_prizes"("claim_id");
CREATE UNIQUE INDEX "retained_prizes_draw_id_kind_tier_no_key" ON "retained_prizes"("draw_id", "kind", "tier_no");
CREATE INDEX "retained_prizes_recorded_at_idx" ON "retained_prizes"("recorded_at");
CREATE UNIQUE INDEX "prize_claims_draw_winner_id_key" ON "prize_claims"("draw_winner_id");
CREATE INDEX "prize_claims_draw_result_id_idx" ON "prize_claims"("draw_result_id");

-- AddForeignKey
ALTER TABLE "draw_prize_tiers" ADD CONSTRAINT "draw_prize_tiers_draw_id_fkey" FOREIGN KEY ("draw_id") REFERENCES "draws"("draw_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "draw_winners" ADD CONSTRAINT "draw_winners_draw_id_fkey" FOREIGN KEY ("draw_id") REFERENCES "draws"("draw_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "draw_winners" ADD CONSTRAINT "draw_winners_result_id_fkey" FOREIGN KEY ("result_id") REFERENCES "draw_results"("result_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "retained_prizes" ADD CONSTRAINT "retained_prizes_draw_id_fkey" FOREIGN KEY ("draw_id") REFERENCES "draws"("draw_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "prize_claims" ADD CONSTRAINT "prize_claims_draw_winner_id_fkey" FOREIGN KEY ("draw_winner_id") REFERENCES "draw_winners"("winner_id") ON DELETE RESTRICT ON UPDATE CASCADE;
