
-- Prevent multiple approved payout accounts per customer.
CREATE UNIQUE INDEX "verified_payout_accounts_one_approved_per_user"
ON "verified_payout_accounts" ("user_id")
WHERE "status" IN ('VERIFIED', 'LOCKED');

-- Prevent multiple pending accounts per customer.
CREATE UNIQUE INDEX "verified_payout_accounts_one_pending_per_user"
ON "verified_payout_accounts" ("user_id")
WHERE "status" = 'PENDING';

-- Validate account metadata.
ALTER TABLE "verified_payout_accounts"
ADD CONSTRAINT "verified_payout_accounts_bank_fields_check"
CHECK (
  "currency" = 'NGN'
  AND "bank_code" ~ '^[0-9]{3,6}$'
  AND "account_last4" ~ '^[0-9]{4}$'
  AND "account_fingerprint" ~ '^[0-9a-f]{64}$'
);

-- Enforce payout account lifecycle requirements.
ALTER TABLE "verified_payout_accounts"
ADD CONSTRAINT "verified_payout_accounts_lifecycle_check"
CHECK (
  (
    "status" = 'PENDING'
    AND "verified_at" IS NULL
    AND "locked_at" IS NULL
    AND "revoked_at" IS NULL
  )
  OR
  (
    "status" = 'VERIFIED'
    AND "identity_check_id" IS NOT NULL
    AND "verified_at" IS NOT NULL
    AND "locked_at" IS NULL
    AND "revoked_at" IS NULL
  )
  OR
  (
    "status" = 'LOCKED'
    AND "identity_check_id" IS NOT NULL
    AND "verified_at" IS NOT NULL
    AND "locked_at" IS NOT NULL
    AND "revoked_at" IS NULL
  )
  OR
  (
    "status" = 'REVOKED'
    AND "revoked_at" IS NOT NULL
  )
);
