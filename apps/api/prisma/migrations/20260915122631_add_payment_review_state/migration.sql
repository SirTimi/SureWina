-- AlterEnum
ALTER TYPE "PaymentStatus" ADD VALUE 'REVIEW_REQUIRED';

-- AlterTable
ALTER TABLE "payment_transactions" ADD COLUMN     "provider_paid_at" TIMESTAMP(3);
