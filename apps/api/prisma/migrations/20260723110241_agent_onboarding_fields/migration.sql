-- AlterTable
ALTER TABLE "agents" ADD COLUMN     "id_doc_path" TEXT,
ADD COLUMN     "id_doc_type" TEXT,
ADD COLUMN     "nin_hash" TEXT,
ADD COLUMN     "onboarded_by_admin_id" TEXT,
ADD COLUMN     "onboarding_note" TEXT;
