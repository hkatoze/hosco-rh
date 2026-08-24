-- CreateEnum
CREATE TYPE "TypeContrat" AS ENUM ('CDI', 'CDD', 'STAGE', 'VACATAIRE');

-- CreateEnum
CREATE TYPE "SituationMatrimoniale" AS ENUM ('CELIBATAIRE', 'MARIE', 'DIVORCE', 'VEUF');

-- AlterEnum
BEGIN;
CREATE TYPE "TypeMouvement_new" AS ENUM ('RECRUTEMENT', 'CONGE', 'SUSPENSION', 'FIN_SUSPENSION', 'DEMISSION', 'LICENCIEMENT', 'RETRAITE', 'DECES');
ALTER TABLE "Mouvement" ALTER COLUMN "type" TYPE "TypeMouvement_new" USING ("type"::text::"TypeMouvement_new");
ALTER TYPE "TypeMouvement" RENAME TO "TypeMouvement_old";
ALTER TYPE "TypeMouvement_new" RENAME TO "TypeMouvement";
DROP TYPE "TypeMouvement_old";
COMMIT;

-- DropIndex
DROP INDEX "Mouvement_documentId_key";

-- AlterTable
ALTER TABLE "Agent" ALTER COLUMN "dateNaissance" SET DATA TYPE DATE,
DROP COLUMN "situationMatrimoniale",
ADD COLUMN     "situationMatrimoniale" "SituationMatrimoniale",
ALTER COLUMN "dateRecrutement" SET DATA TYPE DATE,
DROP COLUMN "typeContrat",
ADD COLUMN     "typeContrat" "TypeContrat" NOT NULL;

-- AlterTable
ALTER TABLE "Journal" ALTER COLUMN "cibleId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "Mouvement" ALTER COLUMN "dateEffet" SET DATA TYPE DATE,
ALTER COLUMN "dateFin" SET DATA TYPE DATE;

-- CreateIndex
CREATE INDEX "Mouvement_documentId_idx" ON "Mouvement"("documentId");

