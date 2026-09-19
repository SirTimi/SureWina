-- Phase 7: agent money ledger links

ALTER TABLE "prize_claims"
ADD COLUMN "agent_payout_ledger_txn_id" TEXT;

CREATE UNIQUE INDEX "prize_claims_agent_payout_ledger_txn_id_key"
ON "prize_claims"("agent_payout_ledger_txn_id");

ALTER TABLE "prize_claims"
ADD CONSTRAINT "prize_claims_agent_payout_ledger_txn_id_fkey"
FOREIGN KEY ("agent_payout_ledger_txn_id")
REFERENCES "ledger_transactions"("ledger_txn_id")
ON DELETE RESTRICT
ON UPDATE CASCADE;

ALTER TABLE "remittances"
ADD COLUMN "commission_ledger_txn_id" TEXT,
ADD COLUMN "settlement_ledger_txn_id" TEXT,
ADD COLUMN "wallet_credit_ledger_txn_id" TEXT;

CREATE UNIQUE INDEX "remittances_commission_ledger_txn_id_key"
ON "remittances"("commission_ledger_txn_id");

CREATE UNIQUE INDEX "remittances_settlement_ledger_txn_id_key"
ON "remittances"("settlement_ledger_txn_id");

CREATE UNIQUE INDEX "remittances_wallet_credit_ledger_txn_id_key"
ON "remittances"("wallet_credit_ledger_txn_id");

ALTER TABLE "remittances"
ADD CONSTRAINT "remittances_commission_ledger_txn_id_fkey"
FOREIGN KEY ("commission_ledger_txn_id")
REFERENCES "ledger_transactions"("ledger_txn_id")
ON DELETE RESTRICT
ON UPDATE CASCADE;

ALTER TABLE "remittances"
ADD CONSTRAINT "remittances_settlement_ledger_txn_id_fkey"
FOREIGN KEY ("settlement_ledger_txn_id")
REFERENCES "ledger_transactions"("ledger_txn_id")
ON DELETE RESTRICT
ON UPDATE CASCADE;

ALTER TABLE "remittances"
ADD CONSTRAINT "remittances_wallet_credit_ledger_txn_id_fkey"
FOREIGN KEY ("wallet_credit_ledger_txn_id")
REFERENCES "ledger_transactions"("ledger_txn_id")
ON DELETE RESTRICT
ON UPDATE CASCADE;
