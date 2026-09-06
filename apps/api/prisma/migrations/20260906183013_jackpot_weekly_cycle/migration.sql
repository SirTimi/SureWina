-- AlterTable
ALTER TABLE "jackpot_accumulations" ADD COLUMN     "cycle_draw_id" TEXT,
ADD COLUMN     "lifetime_entries_total" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "lifetime_ticket_count" INTEGER NOT NULL DEFAULT 0;
