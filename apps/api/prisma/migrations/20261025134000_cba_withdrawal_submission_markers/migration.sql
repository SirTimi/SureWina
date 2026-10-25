-- Repair a divergence introduced by the original CBA withdrawal migration.
-- Both fields exist in schema.prisma but were omitted from
-- 20261024144853_cba_wallet_withdrawals/migration.sql.
--
-- Nullable timestamps preserve any existing withdrawal rows unchanged.
-- These are only durable external-submission markers: this migration never
-- initiates a debit, sends money, settles a hold, or changes balances.
--
-- Do not modify the already-applied historical migration.
ALTER TABLE "wallet_withdrawals"
  ADD COLUMN "cba_submission_started_at" TIMESTAMP(3),
  ADD COLUMN "paystack_submission_started_at" TIMESTAMP(3);
