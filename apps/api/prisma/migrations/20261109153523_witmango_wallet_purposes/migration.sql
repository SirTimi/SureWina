-- Two CBA accounts per wallet: one link per purpose.

CREATE TYPE "WitmangoWalletPurpose" AS ENUM ('DEPOSIT', 'WINNINGS', 'FLOAT', 'EARNINGS');

ALTER TABLE "witmango_wallet_links"
  ADD COLUMN "purpose" "WitmangoWalletPurpose",
  ADD COLUMN "account_external_id" VARCHAR(100),
  ADD COLUMN "savings_product_id" INTEGER;

-- Every link created before this migration was a single customer account
-- opened with the client. Under the two-account model, that account is the
-- customer's deposit wallet. Its winnings account does not exist yet and
-- must be opened deliberately — this migration creates nothing on the CBA.
UPDATE "witmango_wallet_links"
SET "purpose" = 'DEPOSIT'
WHERE "purpose" IS NULL;

ALTER TABLE "witmango_wallet_links"
  ALTER COLUMN "purpose" SET NOT NULL;

DROP INDEX "witmango_wallet_links_wallet_id_key";
DROP INDEX "witmango_wallet_links_tenant_id_client_external_id_key";

CREATE UNIQUE INDEX "witmango_wallet_links_wallet_id_purpose_key"
  ON "witmango_wallet_links"("wallet_id", "purpose");

CREATE UNIQUE INDEX "witmango_wallet_links_tenant_id_client_external_id_purpose_key"
  ON "witmango_wallet_links"("tenant_id", "client_external_id", "purpose");

CREATE UNIQUE INDEX "witmango_wallet_links_tenant_id_account_external_id_key"
  ON "witmango_wallet_links"("tenant_id", "account_external_id");