/*
  Warnings:

  - A unique constraint covering the columns `[terminal_number]` on the table `agents` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[draw_number]` on the table `draws` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "agents" ADD COLUMN     "terminal_number" SERIAL;

-- AlterTable
ALTER TABLE "draws" ADD COLUMN     "draw_number" SERIAL NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "agents_terminal_number_key" ON "agents"("terminal_number");

-- CreateIndex
CREATE UNIQUE INDEX "draws_draw_number_key" ON "draws"("draw_number");
