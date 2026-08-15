-- AlterTable
ALTER TABLE "prize_claims" ADD COLUMN     "paid_by_agent_at" TIMESTAMP(3),
ADD COLUMN     "paid_by_agent_id" TEXT;

-- CreateIndex
CREATE INDEX "prize_claims_paid_by_agent_id_paid_by_agent_at_idx" ON "prize_claims"("paid_by_agent_id", "paid_by_agent_at");

-- AddForeignKey
ALTER TABLE "prize_claims" ADD CONSTRAINT "prize_claims_paid_by_agent_id_fkey" FOREIGN KEY ("paid_by_agent_id") REFERENCES "agents"("agent_id") ON DELETE SET NULL ON UPDATE CASCADE;
