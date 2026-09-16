-- ============================================================
-- PHASE 3 WALLET INVARIANTS
-- ============================================================

ALTER TABLE "wallets"
ADD CONSTRAINT "wallet_currency_format"
CHECK (
  char_length("currency") = 3
  AND "currency" = upper("currency")
);

ALTER TABLE "wallets"
ADD CONSTRAINT "wallet_accounts_must_differ"
CHECK ("available_account_id" <> "held_account_id");

ALTER TABLE "wallets"
ADD CONSTRAINT "wallet_exactly_one_owner"
CHECK (
  (
    "owner_type"::text = 'CUSTOMER'
    AND "user_id" IS NOT NULL
    AND "agent_id" IS NULL
  )
  OR
  (
    "owner_type"::text = 'AGENT'
    AND "agent_id" IS NOT NULL
    AND "user_id" IS NULL
  )
);

ALTER TABLE "wallet_holds"
ADD CONSTRAINT "wallet_hold_amount_positive"
CHECK ("amount_ngn" > 0);

ALTER TABLE "wallet_holds"
ADD CONSTRAINT "wallet_hold_resolution_consistency"
CHECK (
  (
    "status"::text = 'HELD'
    AND "release_ledger_txn_id" IS NULL
    AND "capture_ledger_txn_id" IS NULL
    AND "release_idempotency_key" IS NULL
    AND "capture_idempotency_key" IS NULL
    AND "resolved_at" IS NULL
  )
  OR
  (
    "status"::text = 'RELEASED'
    AND "release_ledger_txn_id" IS NOT NULL
    AND "capture_ledger_txn_id" IS NULL
    AND "release_idempotency_key" IS NOT NULL
    AND "capture_idempotency_key" IS NULL
    AND "resolved_at" IS NOT NULL
  )
  OR
  (
    "status"::text = 'CAPTURED'
    AND "capture_ledger_txn_id" IS NOT NULL
    AND "release_ledger_txn_id" IS NULL
    AND "capture_idempotency_key" IS NOT NULL
    AND "release_idempotency_key" IS NULL
    AND "resolved_at" IS NOT NULL
  )
);


-- Wallet identity can never be changed after creation.
CREATE OR REPLACE FUNCTION surewina_protect_wallet_identity()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF
    OLD."owner_type" IS DISTINCT FROM NEW."owner_type"
    OR OLD."user_id" IS DISTINCT FROM NEW."user_id"
    OR OLD."agent_id" IS DISTINCT FROM NEW."agent_id"
    OR OLD."currency" IS DISTINCT FROM NEW."currency"
    OR OLD."available_account_id" IS DISTINCT FROM NEW."available_account_id"
    OR OLD."held_account_id" IS DISTINCT FROM NEW."held_account_id"
  THEN
    RAISE EXCEPTION
      'Wallet accounting identity cannot be changed.'
      USING ERRCODE = '55000';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER wallet_identity_immutable
BEFORE UPDATE
ON "wallets"
FOR EACH ROW
EXECUTE FUNCTION surewina_protect_wallet_identity();


-- Make sure the wallet is attached to the correct ledger account types.
CREATE OR REPLACE FUNCTION surewina_validate_wallet_accounts()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  available_purpose TEXT;
  available_owner_type TEXT;
  available_owner_id TEXT;
  available_account_type TEXT;
  available_currency TEXT;

  held_purpose TEXT;
  held_owner_type TEXT;
  held_owner_id TEXT;
  held_account_type TEXT;
  held_currency TEXT;

  expected_owner_id TEXT;
  expected_available_purpose TEXT;
  expected_held_purpose TEXT;
BEGIN
  expected_owner_id :=
    CASE
      WHEN NEW."owner_type"::text = 'CUSTOMER'
      THEN NEW."user_id"
      ELSE NEW."agent_id"
    END;

  expected_available_purpose :=
    CASE
      WHEN NEW."owner_type"::text = 'CUSTOMER'
      THEN 'CUSTOMER_AVAILABLE'
      ELSE 'AGENT_AVAILABLE'
    END;

  expected_held_purpose :=
    CASE
      WHEN NEW."owner_type"::text = 'CUSTOMER'
      THEN 'CUSTOMER_HELD'
      ELSE 'AGENT_HELD'
    END;

  SELECT
    "purpose"::text,
    "owner_type"::text,
    "owner_id",
    "account_type"::text,
    "currency"
  INTO
    available_purpose,
    available_owner_type,
    available_owner_id,
    available_account_type,
    available_currency
  FROM "ledger_accounts"
  WHERE "account_id" = NEW."available_account_id";

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Wallet available ledger account does not exist';
  END IF;

  SELECT
    "purpose"::text,
    "owner_type"::text,
    "owner_id",
    "account_type"::text,
    "currency"
  INTO
    held_purpose,
    held_owner_type,
    held_owner_id,
    held_account_type,
    held_currency
  FROM "ledger_accounts"
  WHERE "account_id" = NEW."held_account_id";

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Wallet held ledger account does not exist';
  END IF;

  IF
    available_purpose <> expected_available_purpose
    OR held_purpose <> expected_held_purpose
    OR available_owner_type <> NEW."owner_type"::text
    OR held_owner_type <> NEW."owner_type"::text
    OR available_owner_id <> expected_owner_id
    OR held_owner_id <> expected_owner_id
    OR available_account_type <> 'LIABILITY'
    OR held_account_type <> 'LIABILITY'
    OR available_currency <> NEW."currency"
    OR held_currency <> NEW."currency"
  THEN
    RAISE EXCEPTION
      'Wallet ledger account binding is invalid.'
      USING ERRCODE = '55000';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER wallet_account_binding_valid
BEFORE INSERT OR UPDATE
ON "wallets"
FOR EACH ROW
EXECUTE FUNCTION surewina_validate_wallet_accounts();


-- Protect the immutable identity of a hold.
CREATE OR REPLACE FUNCTION surewina_protect_wallet_hold_identity()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF
    OLD."wallet_id" IS DISTINCT FROM NEW."wallet_id"
    OR OLD."idempotency_key" IS DISTINCT FROM NEW."idempotency_key"
    OR OLD."reference_type" IS DISTINCT FROM NEW."reference_type"
    OR OLD."reference_id" IS DISTINCT FROM NEW."reference_id"
    OR OLD."amount_ngn" IS DISTINCT FROM NEW."amount_ngn"
    OR OLD."hold_ledger_txn_id" IS DISTINCT FROM NEW."hold_ledger_txn_id"
  THEN
    RAISE EXCEPTION
      'Wallet hold identity cannot be changed.'
      USING ERRCODE = '55000';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER wallet_hold_identity_immutable
BEFORE UPDATE
ON "wallet_holds"
FOR EACH ROW
EXECUTE FUNCTION surewina_protect_wallet_hold_identity();


-- ============================================================
-- WALLET NEGATIVE BALANCE PROTECTION
--
-- Wallet accounts are liabilities:
--
-- balance = credits - debits
--
-- This constraint trigger runs at COMMIT so a balanced journal
-- can insert all of its lines first.
-- ============================================================

CREATE OR REPLACE FUNCTION surewina_validate_wallet_nonnegative()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  account_purpose TEXT;
  account_balance BIGINT;
BEGIN
  SELECT "purpose"::text
  INTO account_purpose
  FROM "ledger_accounts"
  WHERE "account_id" = NEW."account_id";

  IF account_purpose NOT IN (
    'CUSTOMER_AVAILABLE',
    'CUSTOMER_HELD',
    'AGENT_AVAILABLE',
    'AGENT_HELD'
  ) THEN
    RETURN NEW;
  END IF;

  SELECT
    COALESCE(
      SUM(
        CASE
          WHEN "side"::text = 'CREDIT'
          THEN "amount_ngn"
          ELSE -"amount_ngn"
        END
      ),
      0
    )
  INTO account_balance
  FROM "ledger_entries"
  WHERE "account_id" = NEW."account_id";

  IF account_balance < 0 THEN
    RAISE EXCEPTION
      'Wallet ledger account % would become negative: %',
      NEW."account_id",
      account_balance
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

CREATE CONSTRAINT TRIGGER wallet_nonnegative_balance
AFTER INSERT
ON "ledger_entries"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
EXECUTE FUNCTION surewina_validate_wallet_nonnegative();