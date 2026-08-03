-- AlterTable
ALTER TABLE "agents" ALTER COLUMN "terminal_number" DROP NOT NULL;

-- AlterTable
ALTER TABLE "payment_transactions" ADD COLUMN     "buyer_email" TEXT;
