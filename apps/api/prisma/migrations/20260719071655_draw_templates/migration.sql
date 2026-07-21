-- CreateEnum
CREATE TYPE "ConfigVersionStatus" AS ENUM ('DRAFT', 'PENDING_APPROVAL', 'ACTIVE', 'SUPERSEDED', 'REJECTED');

-- CreateEnum
CREATE TYPE "DrawTemplateType" AS ENUM ('DAILY_STANDARD', 'SATURDAY_JACKPOT');

-- CreateTable
CREATE TABLE "draw_templates" (
    "template_id" TEXT NOT NULL,
    "template_type" "DrawTemplateType" NOT NULL,
    "label" TEXT NOT NULL,
    "prize_description" TEXT NOT NULL,
    "prize_value_ngn" INTEGER NOT NULL,
    "ticket_price_ngn" INTEGER NOT NULL,
    "ticket_quota" INTEGER,
    "cutoff_minutes_wat" INTEGER NOT NULL,
    "scheduled_minutes_wat" INTEGER NOT NULL,
    "weekdays" INTEGER[],
    "version" INTEGER NOT NULL DEFAULT 1,
    "status" "ConfigVersionStatus" NOT NULL DEFAULT 'DRAFT',
    "effective_from" TIMESTAMP(3) NOT NULL,
    "effective_to" TIMESTAMP(3),
    "created_by_admin_id" TEXT NOT NULL,
    "approved_by_admin_id" TEXT,
    "approved_at" TIMESTAMP(3),
    "rejection_note" TEXT,
    "supersedes_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "draw_templates_pkey" PRIMARY KEY ("template_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "draw_templates_supersedes_id_key" ON "draw_templates"("supersedes_id");

-- CreateIndex
CREATE INDEX "draw_templates_template_type_status_effective_from_idx" ON "draw_templates"("template_type", "status", "effective_from");

-- AddForeignKey
ALTER TABLE "draw_templates" ADD CONSTRAINT "draw_templates_supersedes_id_fkey" FOREIGN KEY ("supersedes_id") REFERENCES "draw_templates"("template_id") ON DELETE SET NULL ON UPDATE CASCADE;
