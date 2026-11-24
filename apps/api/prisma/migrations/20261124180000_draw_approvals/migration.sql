-- Phase 2: draw approvals.
-- Gate 1: setup approval before sales open. Gate 2: reconciliation and the
-- owner's approval after sales close, before the engine runs the draw.

ALTER TABLE "draws"
    ADD COLUMN "setup_approved_at" TIMESTAMP(3),
    ADD COLUMN "setup_approved_by" TEXT;

-- Every draw that exists today keeps working: it is treated as approved.
UPDATE "draws" SET "setup_approved_at" = "created_at", "setup_approved_by" = 'existing-before-approvals';

CREATE TYPE "DrawReleaseStatus" AS ENUM ('CHECKS_FAILED', 'AWAITING_APPROVAL', 'APPROVED', 'REJECTED', 'INVALIDATED');

CREATE TABLE "draw_releases" (
    "release_id" TEXT NOT NULL,
    "draw_id" TEXT NOT NULL,
    "status" "DrawReleaseStatus" NOT NULL,
    "checks" JSONB NOT NULL,
    "snapshot_hash" VARCHAR(64) NOT NULL,
    "tickets" INTEGER NOT NULL,
    "entries" INTEGER NOT NULL,
    "sales_ngn" INTEGER NOT NULL,
    "checked_at" TIMESTAMP(3) NOT NULL,
    "check_runs" INTEGER NOT NULL DEFAULT 1,
    "approved_by" TEXT,
    "approved_at" TIMESTAMP(3),
    "rejected_by" TEXT,
    "rejected_at" TIMESTAMP(3),
    "rejection_reason" VARCHAR(500),
    "escalated_at" TIMESTAMP(3),
    "invalidated_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "draw_releases_pkey" PRIMARY KEY ("release_id"),
    CONSTRAINT "draw_releases_hash_check" CHECK ("snapshot_hash" ~ '^[0-9a-f]{64}$'),
    -- An approval always records who and when.
    CONSTRAINT "draw_releases_approved_check" CHECK ("status" <> 'APPROVED' OR ("approved_by" IS NOT NULL AND "approved_at" IS NOT NULL)),
    CONSTRAINT "draw_releases_rejected_check" CHECK ("status" <> 'REJECTED' OR ("rejected_by" IS NOT NULL AND "rejection_reason" IS NOT NULL))
);

CREATE UNIQUE INDEX "draw_releases_draw_id_key" ON "draw_releases"("draw_id");
CREATE INDEX "draw_releases_status_idx" ON "draw_releases"("status");

ALTER TABLE "draw_releases" ADD CONSTRAINT "draw_releases_draw_id_fkey"
    FOREIGN KEY ("draw_id") REFERENCES "draws"("draw_id") ON DELETE RESTRICT ON UPDATE CASCADE;
