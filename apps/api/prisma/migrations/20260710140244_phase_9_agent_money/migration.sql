-- CreateEnum
CREATE TYPE "RemittanceStatus" AS ENUM ('PENDING', 'AGENT_CONFIRMED', 'RECEIVED', 'LATE', 'WRITTEN_OFF');

-- CreateEnum
CREATE TYPE "DisbStatus" AS ENUM ('PENDING', 'INITIATED', 'SETTLED', 'FAILED');

-- AlterEnum
ALTER TYPE "PaymentGateway" ADD VALUE 'AGENT_CASH';

-- CreateTable
CREATE TABLE "remittances" (
    "remittance_id" TEXT NOT NULL,
    "agent_id" TEXT NOT NULL,
    "period_date" DATE NOT NULL,
    "gross_sales_ngn" INTEGER NOT NULL,
    "commission_ngn" INTEGER NOT NULL,
    "amount_due_ngn" INTEGER NOT NULL,
    "ticket_count" INTEGER NOT NULL,
    "status" "RemittanceStatus" NOT NULL DEFAULT 'PENDING',
    "bank_transfer_ref" TEXT,
    "agent_confirmed_at" TIMESTAMP(3),
    "received_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "remittances_pkey" PRIMARY KEY ("remittance_id")
);

-- CreateTable
CREATE TABLE "commission_disbursements" (
    "disb_id" TEXT NOT NULL,
    "agent_id" TEXT NOT NULL,
    "period_date" DATE NOT NULL,
    "amount_ngn" INTEGER NOT NULL,
    "ticket_count" INTEGER NOT NULL,
    "status" "DisbStatus" NOT NULL DEFAULT 'PENDING',
    "payout_reference" TEXT,
    "initiated_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "commission_disbursements_pkey" PRIMARY KEY ("disb_id")
);

-- CreateIndex
CREATE INDEX "remittances_status_period_date_idx" ON "remittances"("status", "period_date");

-- CreateIndex
CREATE UNIQUE INDEX "remittances_agent_id_period_date_key" ON "remittances"("agent_id", "period_date");

-- CreateIndex
CREATE UNIQUE INDEX "commission_disbursements_agent_id_period_date_key" ON "commission_disbursements"("agent_id", "period_date");

-- AddForeignKey
ALTER TABLE "remittances" ADD CONSTRAINT "remittances_agent_id_fkey" FOREIGN KEY ("agent_id") REFERENCES "agents"("agent_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commission_disbursements" ADD CONSTRAINT "commission_disbursements_agent_id_fkey" FOREIGN KEY ("agent_id") REFERENCES "agents"("agent_id") ON DELETE RESTRICT ON UPDATE CASCADE;
