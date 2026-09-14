-- CreateEnum
CREATE TYPE "PrizePayoutStatus" AS ENUM ('REQUESTED', 'SUBMITTED', 'PROCESSING', 'SUCCEEDED', 'FAILED', 'UNKNOWN', 'REVERSED');

-- AlterTable
ALTER TABLE "prize_claims" ADD COLUMN     "payout_completed_at" TIMESTAMP(3),
ADD COLUMN     "payout_failure_reason" TEXT,
ADD COLUMN     "payout_last_checked_at" TIMESTAMP(3),
ADD COLUMN     "payout_status" "PrizePayoutStatus";

-- CreateIndex
CREATE INDEX "prize_claims_payout_status_payout_initiated_at_idx" ON "prize_claims"("payout_status", "payout_initiated_at");
