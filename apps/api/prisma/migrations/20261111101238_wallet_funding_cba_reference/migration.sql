/*
  Warnings:

  - A unique constraint covering the columns `[cba_reference]` on the table `wallet_fundings` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "wallet_fundings" ADD COLUMN     "cba_reference" VARCHAR(50),
ADD COLUMN     "cba_savings_account_id" INTEGER,
ADD COLUMN     "cba_transaction_id" INTEGER;

-- CreateIndex
CREATE UNIQUE INDEX "wallet_fundings_cba_reference_key" ON "wallet_fundings"("cba_reference");
