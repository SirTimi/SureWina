-- CreateTable
CREATE TABLE "wht_certificates" (
    "cert_seq" SERIAL NOT NULL,
    "certificate_no" TEXT NOT NULL,
    "claim_id" TEXT NOT NULL,
    "winner_ticket_ref" TEXT NOT NULL,
    "winner_phone" TEXT NOT NULL,
    "gross_prize_ngn" INTEGER NOT NULL,
    "wht_rate_percent" DECIMAL(5,2) NOT NULL,
    "wht_amount_ngn" INTEGER NOT NULL,
    "net_prize_ngn" INTEGER NOT NULL,
    "issued_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "wht_certificates_pkey" PRIMARY KEY ("cert_seq")
);

-- CreateIndex
CREATE UNIQUE INDEX "wht_certificates_certificate_no_key" ON "wht_certificates"("certificate_no");

-- CreateIndex
CREATE UNIQUE INDEX "wht_certificates_claim_id_key" ON "wht_certificates"("claim_id");

-- CreateIndex
CREATE INDEX "wht_certificates_issued_at_idx" ON "wht_certificates"("issued_at");

-- AddForeignKey
ALTER TABLE "wht_certificates" ADD CONSTRAINT "wht_certificates_claim_id_fkey" FOREIGN KEY ("claim_id") REFERENCES "prize_claims"("claim_id") ON DELETE RESTRICT ON UPDATE CASCADE;
