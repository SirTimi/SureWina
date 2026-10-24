-- CreateEnum
CREATE TYPE "WitmangoWalletLinkStatus" AS ENUM ('PROVISIONING', 'ACTIVE', 'REVIEW_REQUIRED');

-- CreateTable
CREATE TABLE "witmango_wallet_links" (
    "link_id" TEXT NOT NULL,
    "wallet_id" TEXT NOT NULL,
    "tenant_id" VARCHAR(100) NOT NULL,
    "client_external_id" VARCHAR(100) NOT NULL,
    "client_id" INTEGER,
    "savings_account_id" INTEGER,
    "status" "WitmangoWalletLinkStatus" NOT NULL DEFAULT 'PROVISIONING',
    "last_reconciled_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "witmango_wallet_links_pkey" PRIMARY KEY ("link_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "witmango_wallet_links_wallet_id_key" ON "witmango_wallet_links"("wallet_id");

-- CreateIndex
CREATE INDEX "witmango_wallet_links_status_updated_at_idx" ON "witmango_wallet_links"("status", "updated_at");

-- CreateIndex
CREATE UNIQUE INDEX "witmango_wallet_links_tenant_id_client_external_id_key" ON "witmango_wallet_links"("tenant_id", "client_external_id");

-- CreateIndex
CREATE UNIQUE INDEX "witmango_wallet_links_tenant_id_savings_account_id_key" ON "witmango_wallet_links"("tenant_id", "savings_account_id");

-- AddForeignKey
ALTER TABLE "witmango_wallet_links" ADD CONSTRAINT "witmango_wallet_links_wallet_id_fkey" FOREIGN KEY ("wallet_id") REFERENCES "wallets"("wallet_id") ON DELETE RESTRICT ON UPDATE CASCADE;
