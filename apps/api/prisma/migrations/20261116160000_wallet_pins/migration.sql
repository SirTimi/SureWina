-- CreateTable
CREATE TABLE "wallet_pins" (
    "wallet_id" TEXT NOT NULL,
    "pin_hash" VARCHAR(255) NOT NULL,
    "failed_attempts" INTEGER NOT NULL DEFAULT 0,
    "locked_until" TIMESTAMP(3),
    "set_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "wallet_pins_pkey" PRIMARY KEY ("wallet_id")
);

-- AddForeignKey
ALTER TABLE "wallet_pins" ADD CONSTRAINT "wallet_pins_wallet_id_fkey" FOREIGN KEY ("wallet_id") REFERENCES "wallets"("wallet_id") ON DELETE RESTRICT ON UPDATE CASCADE;
