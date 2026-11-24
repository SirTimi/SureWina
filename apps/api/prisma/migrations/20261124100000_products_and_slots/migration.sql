-- Products (daily and jackpot games), twice-daily schedule slots, sales-open
-- times, 4 prize categories for daily products, and item prizes for the
-- jackpot.

CREATE TABLE "products" (
    "product_id" TEXT NOT NULL,
    "code" VARCHAR(12) NOT NULL,
    "name" VARCHAR(60) NOT NULL,
    "ticket_label" VARCHAR(40) NOT NULL,
    "kind" "DrawType" NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "ticket_price_ngn" INTEGER NOT NULL,
    "prize_description" VARCHAR(200) NOT NULL,
    "prize_model" "DrawPrizeModel" NOT NULL,
    "pool_payout_bp" INTEGER,
    "pool_minimum_ngn" INTEGER,
    "pool_revenue_basis" "PoolRevenueBasis",
    "prize_tiers" JSONB NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "pending_change" JSONB,
    "pending_proposed_by" TEXT,
    "pending_proposed_at" TIMESTAMP(3),
    "created_by_admin_id" TEXT NOT NULL,
    "approved_by_admin_id" TEXT,
    "approved_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "products_pkey" PRIMARY KEY ("product_id"),
    CONSTRAINT "products_code_check" CHECK ("code" ~ '^[A-Z0-9]{2,12}$'),
    CONSTRAINT "products_price_check" CHECK ("ticket_price_ngn" >= 1),
    CONSTRAINT "products_kind_check" CHECK ("kind" IN ('DAILY_STANDARD', 'SATURDAY_JACKPOT')),
    CONSTRAINT "products_model_check" CHECK ("prize_model" IN ('POOL', 'STAGES')),
    CONSTRAINT "products_payout_check" CHECK ("pool_payout_bp" IS NULL OR "pool_payout_bp" BETWEEN 1 AND 10000),
    CONSTRAINT "products_minimum_check" CHECK ("pool_minimum_ngn" IS NULL OR "pool_minimum_ngn" >= 0)
);

CREATE UNIQUE INDEX "products_code_key" ON "products"("code");
CREATE INDEX "products_kind_active_idx" ON "products"("kind", "active");

-- Draws: product, slot and sales-open time.
ALTER TABLE "draws"
    ADD COLUMN "product_id" TEXT,
    ADD COLUMN "slot_code" VARCHAR(20),
    ADD COLUMN "sales_open_at" TIMESTAMP(3);

ALTER TABLE "draws" ADD CONSTRAINT "draws_sales_open_check"
    CHECK ("sales_open_at" IS NULL OR "sales_open_at" < "cutoff_at");

CREATE INDEX "draws_product_id_scheduled_at_idx" ON "draws"("product_id", "scheduled_at");

ALTER TABLE "draws" ADD CONSTRAINT "draws_product_id_fkey"
    FOREIGN KEY ("product_id") REFERENCES "products"("product_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Schedules: product, slot and sales-open time.
ALTER TABLE "draw_templates"
    ADD COLUMN "product_id" TEXT,
    ADD COLUMN "slot_code" VARCHAR(20),
    ADD COLUMN "sales_open_minutes_wat" INTEGER,
    ADD COLUMN "sales_open_previous_day" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "draw_templates" ADD CONSTRAINT "draw_templates_sales_open_check"
    CHECK ("sales_open_minutes_wat" IS NULL OR "sales_open_minutes_wat" BETWEEN 0 AND 1439);

CREATE INDEX "draw_templates_product_id_slot_code_status_idx" ON "draw_templates"("product_id", "slot_code", "status");

ALTER TABLE "draw_templates" ADD CONSTRAINT "draw_templates_product_id_fkey"
    FOREIGN KEY ("product_id") REFERENCES "products"("product_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Daily products have 4 prize categories.
ALTER TABLE "draw_prize_tiers" DROP CONSTRAINT "draw_prize_tiers_tier_no_check";
ALTER TABLE "draw_prize_tiers" ADD CONSTRAINT "draw_prize_tiers_tier_no_check" CHECK ("tier_no" BETWEEN 1 AND 4);

-- Jackpot item prizes (the prize amount is the item's cash value).
ALTER TABLE "draw_prize_tiers" ADD COLUMN "item_prize" BOOLEAN NOT NULL DEFAULT false;

-- One automatic wallet credit attempt per claim.
ALTER TABLE "prize_claims" ADD COLUMN "auto_credit_attempted_at" TIMESTAMP(3);
