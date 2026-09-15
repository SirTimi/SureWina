-- AlterTable
ALTER TABLE "payment_transactions" ADD COLUMN     "purchase_draw_id" TEXT;

-- AddForeignKey
ALTER TABLE "payment_transactions" ADD CONSTRAINT "payment_transactions_purchase_draw_id_fkey" FOREIGN KEY ("purchase_draw_id") REFERENCES "draws"("draw_id") ON DELETE SET NULL ON UPDATE CASCADE;
