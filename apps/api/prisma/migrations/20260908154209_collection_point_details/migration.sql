-- AlterTable
ALTER TABLE "collection_points" ADD COLUMN     "contact_phone" TEXT,
ADD COLUMN     "opening_hours" TEXT,
ADD COLUMN     "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
