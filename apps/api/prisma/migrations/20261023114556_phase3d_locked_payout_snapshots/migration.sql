-- AlterTable
ALTER TABLE "prize_payout_attempts" ADD COLUMN     "destination_account_ciphertext" TEXT,
ADD COLUMN     "destination_account_fingerprint" VARCHAR(64),
ADD COLUMN     "verified_payout_account_id" TEXT;

-- AddForeignKey
ALTER TABLE "prize_payout_attempts" ADD CONSTRAINT "prize_payout_attempts_verified_payout_account_id_fkey" FOREIGN KEY ("verified_payout_account_id") REFERENCES "verified_payout_accounts"("payout_account_id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Legacy attempts may have no beneficiary snapshot.
-- New snapshot records must be complete.
ALTER TABLE "prize_payout_attempts"
ADD CONSTRAINT "prize_payout_snapshot_complete"
CHECK (
  (
    "verified_payout_account_id" IS NULL
    AND "destination_account_fingerprint" IS NULL
    AND "destination_account_ciphertext" IS NULL
  )
  OR
  (
    "verified_payout_account_id" IS NOT NULL
    AND "destination_account_fingerprint" ~ '^[0-9a-f]{64}$'
    AND "destination_account_ciphertext" IS NOT NULL
    AND length("destination_account_ciphertext") > 20
  )
);

-- Prevent an existing payout attempt from being
-- redirected by editing its recorded bank destination.
CREATE FUNCTION prevent_prize_payout_destination_change()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF
    OLD.verified_payout_account_id IS DISTINCT FROM
      NEW.verified_payout_account_id
    OR OLD.destination_account_fingerprint IS DISTINCT FROM
      NEW.destination_account_fingerprint
    OR OLD.destination_account_ciphertext IS DISTINCT FROM
      NEW.destination_account_ciphertext
    OR OLD.destination_bank_code IS DISTINCT FROM
      NEW.destination_bank_code
    OR OLD.destination_account_last4 IS DISTINCT FROM
      NEW.destination_account_last4
    OR OLD.destination_account_name_hash IS DISTINCT FROM
      NEW.destination_account_name_hash
  THEN
    RAISE EXCEPTION
      'Payout destination snapshots are immutable';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER "prevent_prize_payout_destination_update"
BEFORE UPDATE ON "prize_payout_attempts"
FOR EACH ROW
EXECUTE FUNCTION prevent_prize_payout_destination_change();
