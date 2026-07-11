-- CreateTable
CREATE TABLE "blocked_phones" (
    "phone_number" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "blocked_by" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "blocked_phones_pkey" PRIMARY KEY ("phone_number")
);
