-- CreateEnum
CREATE TYPE "IdentityDocumentType" AS ENUM ('BVN', 'NIN');

-- CreateEnum
CREATE TYPE "IdentityVerificationStatus" AS ENUM ('PENDING', 'VERIFIED', 'FAILED', 'ERROR');

-- CreateTable
CREATE TABLE "identity_verification_attempts" (
    "attempt_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "document_type" "IdentityDocumentType" NOT NULL,
    "identity_fingerprint" VARCHAR(64) NOT NULL,
    "status" "IdentityVerificationStatus" NOT NULL DEFAULT 'PENDING',
    "provider" VARCHAR(30) NOT NULL DEFAULT 'MONNIFY',
    "name_match" VARCHAR(20),
    "date_of_birth_match" VARCHAR(20),
    "phone_match" VARCHAR(20),
    "failure_reason" VARCHAR(50),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMP(3),

    CONSTRAINT "identity_verification_attempts_pkey" PRIMARY KEY ("attempt_id")
);

-- CreateTable
CREATE TABLE "verified_identities" (
    "identity_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "document_type" "IdentityDocumentType" NOT NULL,
    "identity_fingerprint" VARCHAR(64) NOT NULL,
    "first_name" VARCHAR(50) NOT NULL,
    "last_name" VARCHAR(50) NOT NULL,
    "date_of_birth" DATE NOT NULL,
    "attempt_id" TEXT NOT NULL,
    "verified_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "verified_identities_pkey" PRIMARY KEY ("identity_id")
);

-- CreateIndex
CREATE INDEX "identity_verification_attempts_user_id_status_created_at_idx" ON "identity_verification_attempts"("user_id", "status", "created_at");

-- CreateIndex
CREATE INDEX "identity_verification_attempts_identity_fingerprint_idx" ON "identity_verification_attempts"("identity_fingerprint");

-- CreateIndex
CREATE UNIQUE INDEX "verified_identities_user_id_key" ON "verified_identities"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "verified_identities_identity_fingerprint_key" ON "verified_identities"("identity_fingerprint");

-- CreateIndex
CREATE UNIQUE INDEX "verified_identities_attempt_id_key" ON "verified_identities"("attempt_id");

-- AddForeignKey
ALTER TABLE "identity_verification_attempts" ADD CONSTRAINT "identity_verification_attempts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("user_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "verified_identities" ADD CONSTRAINT "verified_identities_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("user_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "verified_identities" ADD CONSTRAINT "verified_identities_attempt_id_fkey" FOREIGN KEY ("attempt_id") REFERENCES "identity_verification_attempts"("attempt_id") ON DELETE RESTRICT ON UPDATE CASCADE;
