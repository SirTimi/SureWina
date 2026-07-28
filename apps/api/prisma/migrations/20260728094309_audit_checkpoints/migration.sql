/*
  Warnings:

  - A unique constraint covering the columns `[seq]` on the table `audit_log` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "audit_log" ADD COLUMN     "seq" SERIAL NOT NULL;

-- CreateTable
CREATE TABLE "audit_checkpoints" (
    "checkpoint_id" TEXT NOT NULL,
    "window_start" TIMESTAMP(3) NOT NULL,
    "window_end" TIMESTAMP(3) NOT NULL,
    "from_seq" INTEGER NOT NULL,
    "to_seq" INTEGER NOT NULL,
    "entry_count" INTEGER NOT NULL,
    "root_hash" TEXT NOT NULL,
    "previous_root_hash" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_checkpoints_pkey" PRIMARY KEY ("checkpoint_id")
);

-- CreateIndex
CREATE INDEX "audit_checkpoints_window_end_idx" ON "audit_checkpoints"("window_end");

-- CreateIndex
CREATE UNIQUE INDEX "audit_log_seq_key" ON "audit_log"("seq");
