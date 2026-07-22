-- CreateEnum
CREATE TYPE "DisputeStatus" AS ENUM ('OPEN', 'UNDER_REVIEW', 'ESCALATED', 'RESOLVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "DisputeCategory" AS ENUM ('PAYMENT_NO_TICKET', 'PRIZE_NOT_RECEIVED', 'AGENT_CASH_ISSUE', 'RESULT_CONTESTED', 'ACCOUNT_ACCESS', 'OTHER');

-- CreateEnum
CREATE TYPE "DisputeRaisedByType" AS ENUM ('CUSTOMER', 'ADMIN', 'SYSTEM');

-- CreateEnum
CREATE TYPE "DisputeEventType" AS ENUM ('CREATED', 'STATUS_CHANGED', 'NOTE_ADDED', 'ASSIGNED', 'RESOLUTION_RECORDED');

-- CreateTable
CREATE TABLE "disputes" (
    "dispute_id" TEXT NOT NULL,
    "dispute_ref" TEXT NOT NULL,
    "dispute_seq" SERIAL NOT NULL,
    "category" "DisputeCategory" NOT NULL,
    "status" "DisputeStatus" NOT NULL DEFAULT 'OPEN',
    "raised_by_type" "DisputeRaisedByType" NOT NULL,
    "raised_by_admin_id" TEXT,
    "customer_phone" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "ticket_ref" TEXT,
    "payment_txn_id" TEXT,
    "claim_id" TEXT,
    "agent_code" TEXT,
    "assigned_to_admin_id" TEXT,
    "resolution_note" TEXT,
    "resolved_by_admin_id" TEXT,
    "resolved_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "disputes_pkey" PRIMARY KEY ("dispute_id")
);

-- CreateTable
CREATE TABLE "dispute_events" (
    "event_id" TEXT NOT NULL,
    "dispute_id" TEXT NOT NULL,
    "type" "DisputeEventType" NOT NULL,
    "actor_type" "DisputeRaisedByType" NOT NULL,
    "actor_id" TEXT NOT NULL,
    "note" TEXT,
    "from_status" "DisputeStatus",
    "to_status" "DisputeStatus",
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "dispute_events_pkey" PRIMARY KEY ("event_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "disputes_dispute_ref_key" ON "disputes"("dispute_ref");

-- CreateIndex
CREATE UNIQUE INDEX "disputes_dispute_seq_key" ON "disputes"("dispute_seq");

-- CreateIndex
CREATE INDEX "disputes_status_created_at_idx" ON "disputes"("status", "created_at");

-- CreateIndex
CREATE INDEX "disputes_customer_phone_idx" ON "disputes"("customer_phone");

-- CreateIndex
CREATE INDEX "dispute_events_dispute_id_created_at_idx" ON "dispute_events"("dispute_id", "created_at");

-- AddForeignKey
ALTER TABLE "dispute_events" ADD CONSTRAINT "dispute_events_dispute_id_fkey" FOREIGN KEY ("dispute_id") REFERENCES "disputes"("dispute_id") ON DELETE RESTRICT ON UPDATE CASCADE;
