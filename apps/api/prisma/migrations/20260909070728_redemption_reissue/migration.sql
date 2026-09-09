-- AlterTable
ALTER TABLE "prize_claims" ADD COLUMN     "last_reissued_by_admin_id" TEXT,
ADD COLUMN     "redemption_reissues" INTEGER NOT NULL DEFAULT 0;
