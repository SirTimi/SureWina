/*
  Warnings:

  - A unique constraint covering the columns `[payout_idempotency_key]` on the table `prize_claims` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "prize_claims" ADD COLUMN     "payout_idempotency_key" TEXT,
ADD COLUMN     "payout_provider" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "prize_claims_payout_idempotency_key_key" ON "prize_claims"("payout_idempotency_key");

-- CreateIndex
CREATE INDEX "prize_claims_payout_provider_payout_status_idx" ON "prize_claims"("payout_provider", "payout_status");
