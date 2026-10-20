-- CreateEnum
CREATE TYPE "KycIdentityCheckStatus" AS ENUM ('PREPARING', 'SUBMITTED', 'VERIFIED', 'FAILED', 'UNKNOWN');

-- CreateTable
CREATE TABLE "kyc_identity_checks" (
    "check_id" TEXT NOT NULL,
    "claim_id" TEXT NOT NULL,
    "attempt_number" INTEGER NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'PAYSTACK',
    "status" "KycIdentityCheckStatus" NOT NULL DEFAULT 'PREPARING',
    "paystack_customer_code" TEXT,
    "bank_code" TEXT NOT NULL,
    "bank_account_last4" TEXT NOT NULL,
    "bank_account_fingerprint" TEXT NOT NULL,
    "submitted_at" TIMESTAMP(3),
    "verified_at" TIMESTAMP(3),
    "failed_at" TIMESTAMP(3),
    "failure_code" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "kyc_identity_checks_pkey" PRIMARY KEY ("check_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "kyc_identity_checks_paystack_customer_code_key" ON "kyc_identity_checks"("paystack_customer_code");

-- CreateIndex
CREATE INDEX "kyc_identity_checks_claim_id_status_idx" ON "kyc_identity_checks"("claim_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "kyc_identity_checks_claim_id_attempt_number_key" ON "kyc_identity_checks"("claim_id", "attempt_number");

-- AddForeignKey
ALTER TABLE "kyc_identity_checks" ADD CONSTRAINT "kyc_identity_checks_claim_id_fkey" FOREIGN KEY ("claim_id") REFERENCES "prize_claims"("claim_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- RenameIndex
ALTER INDEX "jackpot_discount_offers_buyer_phone_jackpot_draw_id_threshold_n" RENAME TO "jackpot_discount_offers_buyer_phone_jackpot_draw_id_thresho_key";
