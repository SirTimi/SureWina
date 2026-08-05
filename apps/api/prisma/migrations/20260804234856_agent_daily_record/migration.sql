-- AlterTable
ALTER TABLE "remittances" ADD COLUMN     "jackpot_sales_ngn" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "jackpot_ticket_count" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "standard_sales_ngn" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "standard_ticket_count" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "winnings_paid_out_ngn" INTEGER NOT NULL DEFAULT 0;
