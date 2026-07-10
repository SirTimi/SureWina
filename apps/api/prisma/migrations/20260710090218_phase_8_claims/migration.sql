-- CreateEnum
CREATE TYPE "ClaimType" AS ENUM ('PRODUCT', 'CASH');

-- CreateEnum
CREATE TYPE "PrizeClaimStatus" AS ENUM ('NOTIFIED', 'SELECTION_MADE', 'KYC_PENDING', 'KYC_CLEARED', 'PRODUCT_BOOKED', 'DELIVERED', 'CASH_PAID', 'FORFEITED');

-- CreateTable
CREATE TABLE "prize_claims" (
    "claim_id" TEXT NOT NULL,
    "draw_result_id" TEXT NOT NULL,
    "winner_ticket_ref" TEXT NOT NULL,
    "winner_phone" TEXT NOT NULL,
    "winner_user_id" TEXT,
    "claim_type" "ClaimType",
    "claim_type_selected_at" TIMESTAMP(3),
    "status" "PrizeClaimStatus" NOT NULL DEFAULT 'NOTIFIED',
    "gross_prize_value_ngn" INTEGER NOT NULL,
    "wht_applicable" BOOLEAN NOT NULL DEFAULT false,
    "wht_amount_ngn" INTEGER NOT NULL DEFAULT 0,
    "net_prize_value_ngn" INTEGER NOT NULL,
    "selection_deadline_at" TIMESTAMP(3) NOT NULL,
    "claim_deadline_at" TIMESTAMP(3) NOT NULL,
    "forfeited_at" TIMESTAMP(3),
    "fulfilled_at" TIMESTAMP(3),
    "kyc_bvn_hash" TEXT,
    "kyc_bvn_verified_at" TIMESTAMP(3),
    "kyc_bank_code" TEXT,
    "kyc_bank_account_last4" TEXT,
    "kyc_bank_account_name" TEXT,
    "kyc_id_doc_path" TEXT,
    "kyc_selfie_path" TEXT,
    "kyc_reviewed_by" TEXT,
    "kyc_reviewed_at" TIMESTAMP(3),
    "collection_point_id" TEXT,
    "collection_scheduled_at" TIMESTAMP(3),
    "payout_reference" TEXT,
    "payout_initiated_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "prize_claims_pkey" PRIMARY KEY ("claim_id")
);

-- CreateTable
CREATE TABLE "collection_points" (
    "point_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "state_code" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "collection_points_pkey" PRIMARY KEY ("point_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "prize_claims_draw_result_id_key" ON "prize_claims"("draw_result_id");

-- CreateIndex
CREATE INDEX "prize_claims_winner_phone_idx" ON "prize_claims"("winner_phone");

-- CreateIndex
CREATE INDEX "prize_claims_status_selection_deadline_at_idx" ON "prize_claims"("status", "selection_deadline_at");

-- CreateIndex
CREATE INDEX "collection_points_state_code_is_active_idx" ON "collection_points"("state_code", "is_active");

-- AddForeignKey
ALTER TABLE "prize_claims" ADD CONSTRAINT "prize_claims_draw_result_id_fkey" FOREIGN KEY ("draw_result_id") REFERENCES "draw_results"("result_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "prize_claims" ADD CONSTRAINT "prize_claims_collection_point_id_fkey" FOREIGN KEY ("collection_point_id") REFERENCES "collection_points"("point_id") ON DELETE SET NULL ON UPDATE CASCADE;
