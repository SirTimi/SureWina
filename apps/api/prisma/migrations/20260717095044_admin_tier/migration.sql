-- CreateEnum
CREATE TYPE "AdminTier" AS ENUM ('BASIC', 'INTERMEDIATE', 'SUPER', 'AUDITOR');

-- AlterTable
ALTER TABLE "admin_users" ADD COLUMN     "tier" "AdminTier" NOT NULL DEFAULT 'BASIC';
