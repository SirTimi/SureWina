-- CreateEnum
CREATE TYPE "DrawType" AS ENUM ('DAILY_STANDARD', 'SATURDAY_JACKPOT', 'PRODUCT_PRIZE');

-- CreateEnum
CREATE TYPE "DrawStatus" AS ENUM ('SCHEDULED', 'ACTIVE', 'SALES_CLOSED', 'EXECUTING', 'COMPLETED', 'POSTPONED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "PaymentGateway" AS ENUM ('PAYSTACK', 'FLUTTERWAVE');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('PENDING', 'CONFIRMED', 'FAILED', 'DUPLICATE', 'REFUNDED');

-- CreateEnum
CREATE TYPE "PurchaseChannel" AS ENUM ('DIRECT', 'AGENT');

-- CreateEnum
CREATE TYPE "TicketType" AS ENUM ('STANDARD', 'JACKPOT');

-- CreateEnum
CREATE TYPE "TicketStatus" AS ENUM ('ACTIVE', 'EXPIRED', 'WINNING', 'ROLLED_OVER');

-- CreateEnum
CREATE TYPE "JackpotEntrySource" AS ENUM ('ACCUMULATION', 'DIRECT_PURCHASE');

-- CreateEnum
CREATE TYPE "JackpotEntryStatus" AS ENUM ('ACTIVE', 'WINNING', 'EXPIRED');

-- CreateTable
CREATE TABLE "draws" (
    "draw_id" TEXT NOT NULL,
    "draw_code" TEXT NOT NULL,
    "draw_type" "DrawType" NOT NULL,
    "status" "DrawStatus" NOT NULL DEFAULT 'SCHEDULED',
    "prize_description" TEXT NOT NULL,
    "prize_value_ngn" INTEGER NOT NULL,
    "prize_image_url" TEXT,
    "ticket_price_ngn" INTEGER NOT NULL,
    "ticket_quota" INTEGER,
    "scheduled_at" TIMESTAMP(3) NOT NULL,
    "cutoff_at" TIMESTAMP(3) NOT NULL,
    "executed_at" TIMESTAMP(3),
    "rescheduled_from" TEXT,
    "config_version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "draws_pkey" PRIMARY KEY ("draw_id")
);

-- CreateTable
CREATE TABLE "payment_transactions" (
    "txn_id" TEXT NOT NULL,
    "gateway_reference" TEXT NOT NULL,
    "gateway" "PaymentGateway" NOT NULL,
    "amount_ngn" INTEGER NOT NULL,
    "buyer_phone" TEXT NOT NULL,
    "buyer_user_id" TEXT,
    "channel" "PurchaseChannel" NOT NULL,
    "agent_id" TEXT,
    "ticket_count" INTEGER NOT NULL,
    "status" "PaymentStatus" NOT NULL DEFAULT 'PENDING',
    "confirmed_at" TIMESTAMP(3),
    "failure_reason" TEXT,
    "webhook_payload" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payment_transactions_pkey" PRIMARY KEY ("txn_id")
);

-- CreateTable
CREATE TABLE "tickets" (
    "ticket_id" TEXT NOT NULL,
    "ticket_ref" TEXT NOT NULL,
    "draw_id" TEXT NOT NULL,
    "ticket_type" "TicketType" NOT NULL,
    "face_value_ngn" INTEGER NOT NULL,
    "buyer_phone" TEXT NOT NULL,
    "buyer_user_id" TEXT,
    "agent_id" TEXT,
    "purchase_channel" "PurchaseChannel" NOT NULL,
    "state_of_play_code" TEXT NOT NULL,
    "payment_txn_id" TEXT NOT NULL,
    "status" "TicketStatus" NOT NULL DEFAULT 'ACTIVE',
    "is_winner" BOOLEAN NOT NULL DEFAULT false,
    "draw_result_id" TEXT,
    "rolled_to_draw_id" TEXT,
    "confirmation_sms_sent_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tickets_pkey" PRIMARY KEY ("ticket_id")
);

-- CreateTable
CREATE TABLE "jackpot_accumulations" (
    "accum_id" TEXT NOT NULL,
    "buyer_phone" TEXT NOT NULL,
    "buyer_user_id" TEXT,
    "cumulative_count" INTEGER NOT NULL DEFAULT 0,
    "jackpot_entries_total" INTEGER NOT NULL DEFAULT 0,
    "last_ticket_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "jackpot_accumulations_pkey" PRIMARY KEY ("accum_id")
);

-- CreateTable
CREATE TABLE "jackpot_entries" (
    "entry_id" TEXT NOT NULL,
    "draw_id" TEXT NOT NULL,
    "source" "JackpotEntrySource" NOT NULL,
    "source_ticket_id" TEXT,
    "source_accum_id" TEXT,
    "buyer_phone" TEXT NOT NULL,
    "buyer_user_id" TEXT,
    "status" "JackpotEntryStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "jackpot_entries_pkey" PRIMARY KEY ("entry_id")
);

-- CreateTable
CREATE TABLE "draw_results" (
    "result_id" TEXT NOT NULL,
    "draw_id" TEXT NOT NULL,
    "winner_ticket_ref" TEXT NOT NULL,
    "prize_value_ngn" INTEGER NOT NULL,
    "total_tickets_sold" INTEGER NOT NULL,
    "total_eligible_participants" INTEGER NOT NULL,
    "rng_seed_hash" TEXT NOT NULL,
    "rng_seed" TEXT NOT NULL,
    "rng_seed_hashed_at" TIMESTAMP(3) NOT NULL,
    "merkle_root" TEXT NOT NULL,
    "state_breakdown" JSONB NOT NULL,
    "zero_intervention_confirmed" BOOLEAN NOT NULL,
    "engine_version" TEXT NOT NULL,
    "engine_signature" TEXT NOT NULL,
    "executed_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "draw_results_pkey" PRIMARY KEY ("result_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "draws_draw_code_key" ON "draws"("draw_code");

-- CreateIndex
CREATE INDEX "draws_draw_type_status_idx" ON "draws"("draw_type", "status");

-- CreateIndex
CREATE INDEX "draws_scheduled_at_idx" ON "draws"("scheduled_at");

-- CreateIndex
CREATE INDEX "draws_status_cutoff_at_idx" ON "draws"("status", "cutoff_at");

-- CreateIndex
CREATE UNIQUE INDEX "payment_transactions_gateway_reference_key" ON "payment_transactions"("gateway_reference");

-- CreateIndex
CREATE INDEX "payment_transactions_gateway_status_idx" ON "payment_transactions"("gateway", "status");

-- CreateIndex
CREATE INDEX "payment_transactions_buyer_phone_created_at_idx" ON "payment_transactions"("buyer_phone", "created_at");

-- CreateIndex
CREATE INDEX "payment_transactions_agent_id_created_at_idx" ON "payment_transactions"("agent_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "tickets_ticket_ref_key" ON "tickets"("ticket_ref");

-- CreateIndex
CREATE INDEX "tickets_buyer_phone_draw_id_idx" ON "tickets"("buyer_phone", "draw_id");

-- CreateIndex
CREATE INDEX "tickets_draw_id_status_idx" ON "tickets"("draw_id", "status");

-- CreateIndex
CREATE INDEX "tickets_agent_id_created_at_idx" ON "tickets"("agent_id", "created_at");

-- CreateIndex
CREATE INDEX "tickets_ticket_ref_idx" ON "tickets"("ticket_ref");

-- CreateIndex
CREATE INDEX "tickets_payment_txn_id_idx" ON "tickets"("payment_txn_id");

-- CreateIndex
CREATE UNIQUE INDEX "jackpot_accumulations_buyer_phone_key" ON "jackpot_accumulations"("buyer_phone");

-- CreateIndex
CREATE INDEX "jackpot_accumulations_buyer_user_id_idx" ON "jackpot_accumulations"("buyer_user_id");

-- CreateIndex
CREATE INDEX "jackpot_entries_draw_id_status_idx" ON "jackpot_entries"("draw_id", "status");

-- CreateIndex
CREATE INDEX "jackpot_entries_buyer_phone_idx" ON "jackpot_entries"("buyer_phone");

-- CreateIndex
CREATE INDEX "jackpot_entries_buyer_user_id_idx" ON "jackpot_entries"("buyer_user_id");

-- CreateIndex
CREATE UNIQUE INDEX "draw_results_draw_id_key" ON "draw_results"("draw_id");

-- AddForeignKey
ALTER TABLE "payment_transactions" ADD CONSTRAINT "payment_transactions_buyer_user_id_fkey" FOREIGN KEY ("buyer_user_id") REFERENCES "users"("user_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_transactions" ADD CONSTRAINT "payment_transactions_agent_id_fkey" FOREIGN KEY ("agent_id") REFERENCES "agents"("agent_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_draw_id_fkey" FOREIGN KEY ("draw_id") REFERENCES "draws"("draw_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_buyer_user_id_fkey" FOREIGN KEY ("buyer_user_id") REFERENCES "users"("user_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_agent_id_fkey" FOREIGN KEY ("agent_id") REFERENCES "agents"("agent_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_payment_txn_id_fkey" FOREIGN KEY ("payment_txn_id") REFERENCES "payment_transactions"("txn_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "jackpot_accumulations" ADD CONSTRAINT "jackpot_accumulations_buyer_user_id_fkey" FOREIGN KEY ("buyer_user_id") REFERENCES "users"("user_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "jackpot_entries" ADD CONSTRAINT "jackpot_entries_draw_id_fkey" FOREIGN KEY ("draw_id") REFERENCES "draws"("draw_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "draw_results" ADD CONSTRAINT "draw_results_draw_id_fkey" FOREIGN KEY ("draw_id") REFERENCES "draws"("draw_id") ON DELETE RESTRICT ON UPDATE CASCADE;
