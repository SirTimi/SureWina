-- CreateTable
CREATE TABLE "draw_seed_commits" (
    "draw_id" TEXT NOT NULL,
    "seed_hash" TEXT NOT NULL,
    "sealed_seed" TEXT NOT NULL,
    "committed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "draw_seed_commits_pkey" PRIMARY KEY ("draw_id")
);

-- AddForeignKey
ALTER TABLE "draw_seed_commits" ADD CONSTRAINT "draw_seed_commits_draw_id_fkey" FOREIGN KEY ("draw_id") REFERENCES "draws"("draw_id") ON DELETE RESTRICT ON UPDATE CASCADE;
