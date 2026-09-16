/*
  Warnings:

  - A unique constraint covering the columns `[refund_idempotency_key]` on the table `payment_transactions` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateEnum
CREATE TYPE "PaymentRefundStatus" AS ENUM ('REQUESTED', 'SUBMITTED', 'PROCESSING', 'NEEDS_ATTENTION', 'SUCCEEDED', 'FAILED', 'UNKNOWN');

-- AlterEnum
ALTER TYPE "PaymentStatus" ADD VALUE 'REFUND_PENDING';

-- AlterEnum
ALTER TYPE "TicketStatus" ADD VALUE 'REFUND_PENDING';

-- AlterTable
ALTER TABLE "payment_transactions" ADD COLUMN     "provider_transaction_id" TEXT,
ADD COLUMN     "refund_completed_at" TIMESTAMP(3),
ADD COLUMN     "refund_failure_reason" TEXT,
ADD COLUMN     "refund_idempotency_key" TEXT,
ADD COLUMN     "refund_last_checked_at" TIMESTAMP(3),
ADD COLUMN     "refund_provider" "PaymentGateway",
ADD COLUMN     "refund_reason" TEXT,
ADD COLUMN     "refund_reference" TEXT,
ADD COLUMN     "refund_requested_at" TIMESTAMP(3),
ADD COLUMN     "refund_requested_by_admin_id" TEXT,
ADD COLUMN     "refund_status" "PaymentRefundStatus";

-- CreateIndex
CREATE UNIQUE INDEX "payment_transactions_refund_idempotency_key_key" ON "payment_transactions"("refund_idempotency_key");

-- CreateIndex
CREATE INDEX "payment_transactions_gateway_provider_transaction_id_idx" ON "payment_transactions"("gateway", "provider_transaction_id");

-- CreateIndex
CREATE INDEX "payment_transactions_refund_status_refund_requested_at_idx" ON "payment_transactions"("refund_status", "refund_requested_at");
