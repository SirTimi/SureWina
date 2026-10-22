-- CreateEnum
CREATE TYPE "VerifiedPayoutAccountStatus" AS ENUM ('PENDING', 'VERIFIED', 'LOCKED', 'REVOKED');

-- CreateTable
CREATE TABLE "verified_payout_accounts" (
    "payout_account_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "currency" VARCHAR(3) NOT NULL DEFAULT 'NGN',
    "bank_code" VARCHAR(6) NOT NULL,
    "bank_name" VARCHAR(140) NOT NULL,
    "account_ciphertext" TEXT NOT NULL,
    "account_last4" VARCHAR(4) NOT NULL,
    "account_fingerprint" VARCHAR(64) NOT NULL,
    "resolved_account_name" VARCHAR(200) NOT NULL,
    "status" "VerifiedPayoutAccountStatus" NOT NULL DEFAULT 'PENDING',
    "identity_check_id" TEXT,
    "verified_at" TIMESTAMP(3),
    "locked_at" TIMESTAMP(3),
    "revoked_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "verified_payout_accounts_pkey" PRIMARY KEY ("payout_account_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "verified_payout_accounts_identity_check_id_key" ON "verified_payout_accounts"("identity_check_id");

-- CreateIndex
CREATE INDEX "verified_payout_accounts_user_id_status_idx" ON "verified_payout_accounts"("user_id", "status");

-- CreateIndex
CREATE INDEX "verified_payout_accounts_created_at_idx" ON "verified_payout_accounts"("created_at");

-- AddForeignKey
ALTER TABLE "verified_payout_accounts" ADD CONSTRAINT "verified_payout_accounts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("user_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "verified_payout_accounts" ADD CONSTRAINT "verified_payout_accounts_identity_check_id_fkey" FOREIGN KEY ("identity_check_id") REFERENCES "kyc_identity_checks"("check_id") ON DELETE RESTRICT ON UPDATE CASCADE;
