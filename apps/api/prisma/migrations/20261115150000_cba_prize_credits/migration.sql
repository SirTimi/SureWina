-- AlterEnum
ALTER TYPE "PrizeClaimStatus" ADD VALUE 'WALLET_CREDIT_PENDING';

-- AlterEnum
ALTER TYPE "CbaTransferPurpose" ADD VALUE 'PRIZE_CREDIT';
ALTER TYPE "CbaTransferPurpose" ADD VALUE 'PRIZE_REIMBURSEMENT';

-- AlterTable
ALTER TABLE "cba_transfers" ADD COLUMN     "prize_claim_id" TEXT;

-- CreateIndex
CREATE INDEX "cba_transfers_prize_claim_id_idx" ON "cba_transfers"("prize_claim_id");

-- AddForeignKey
ALTER TABLE "cba_transfers" ADD CONSTRAINT "cba_transfers_prize_claim_id_fkey" FOREIGN KEY ("prize_claim_id") REFERENCES "prize_claims"("claim_id") ON DELETE RESTRICT ON UPDATE CASCADE;
