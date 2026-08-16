-- AlterTable
ALTER TABLE "agents" ADD COLUMN     "suspended_at" TIMESTAMP(3),
ADD COLUMN     "suspension_reason" TEXT;
