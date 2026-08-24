-- DropIndex
DROP INDEX "Agent_matricule_trgm_idx";

-- DropIndex
DROP INDEX "Agent_nom_trgm_idx";

-- DropIndex
DROP INDEX "Agent_prenom_trgm_idx";

-- AlterTable
ALTER TABLE "Journal" ALTER COLUMN "utilisateurId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "Utilisateur" ADD COLUMN     "doitChangerMotDePasse" BOOLEAN NOT NULL DEFAULT true;

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "utilisateurId" TEXT NOT NULL,
    "expireLe" TIMESTAMP(3) NOT NULL,
    "derniereActivite" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "adresseIp" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Session_tokenHash_key" ON "Session"("tokenHash");

-- CreateIndex
CREATE INDEX "Session_expireLe_idx" ON "Session"("expireLe");

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_utilisateurId_fkey" FOREIGN KEY ("utilisateurId") REFERENCES "Utilisateur"("id") ON DELETE CASCADE ON UPDATE CASCADE;
