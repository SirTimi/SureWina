-- AlterTable
ALTER TABLE "admin_users" ADD COLUMN     "mfa_backup_codes" TEXT[],
ADD COLUMN     "mfa_enrolled_at" TIMESTAMP(3);
