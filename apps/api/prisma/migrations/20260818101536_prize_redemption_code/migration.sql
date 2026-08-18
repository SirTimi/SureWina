-- AlterTable
ALTER TABLE "admin_users" ADD COLUMN     "collection_point_id" TEXT;

-- AlterTable
ALTER TABLE "prize_claims" ADD COLUMN     "redeemed_at" TIMESTAMP(3),
ADD COLUMN     "redeemed_at_point_id" TEXT,
ADD COLUMN     "redeemed_by_admin_id" TEXT,
ADD COLUMN     "redemption_attempts" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "redemption_code_hash" TEXT,
ADD COLUMN     "redemption_code_issued_at" TIMESTAMP(3);
