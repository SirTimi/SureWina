-- Financial invariant: one unresolved CBA withdrawal per wallet.
-- Application row locks remain useful, but this index protects against
-- future writers and concurrent paths that bypass the application check.
-- Deliberately fail deployment if old data already violates the rule;
-- do not silently cancel or release customer holds during migration.
CREATE UNIQUE INDEX "wallet_withdrawals_one_unresolved_per_wallet"
ON "wallet_withdrawals" ("wallet_id")
WHERE "status" IN (
  'RESERVED',
  'CBA_DEBIT_UNKNOWN',
  'CBA_DEBIT_CONFIRMED',
  'BANK_TRANSFER_PENDING',
  'BANK_TRANSFER_UNKNOWN',
  'RESTORE_REQUIRED',
  'REVIEW_REQUIRED'
);
