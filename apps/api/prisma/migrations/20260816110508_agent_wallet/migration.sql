-- AlterEnum
ALTER TYPE "RemittanceStatus" ADD VALUE 'CREDITED_TO_WALLET';

-- AlterTable
ALTER TABLE "agents" ADD COLUMN     "wallet_balance_ngn" INTEGER NOT NULL DEFAULT 0;
