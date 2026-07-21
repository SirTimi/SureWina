/*
  Warnings:

  - You are about to drop the `wht_certificates` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "wht_certificates" DROP CONSTRAINT "wht_certificates_claim_id_fkey";

-- DropTable
DROP TABLE "wht_certificates";

-- CreateTable
CREATE TABLE "wht_deductions" (
    "deduction_seq" SERIAL NOT NULL,
    "deduction_ref" TEXT NOT NULL,
    "claim_id" TEXT NOT NULL,
    "winner_ticket_ref" TEXT NOT NULL,
    "winner_phone" TEXT NOT NULL,
    "gross_prize_ngn" INTEGER NOT NULL,
    "wht_rate_percent" DECIMAL(5,2) NOT NULL,
    "wht_amount_ngn" INTEGER NOT NULL,
    "net_prize_ngn" INTEGER NOT NULL,
    "deducted_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "wht_deductions_pkey" PRIMARY KEY ("deduction_seq")
);

-- CreateIndex
CREATE UNIQUE INDEX "wht_deductions_deduction_ref_key" ON "wht_deductions"("deduction_ref");

-- CreateIndex
CREATE UNIQUE INDEX "wht_deductions_claim_id_key" ON "wht_deductions"("claim_id");

-- CreateIndex
CREATE INDEX "wht_deductions_deducted_at_idx" ON "wht_deductions"("deducted_at");

-- AddForeignKey
ALTER TABLE "wht_deductions" ADD CONSTRAINT "wht_deductions_claim_id_fkey" FOREIGN KEY ("claim_id") REFERENCES "prize_claims"("claim_id") ON DELETE RESTRICT ON UPDATE CASCADE;
