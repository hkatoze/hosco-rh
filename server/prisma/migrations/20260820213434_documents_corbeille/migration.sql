-- NB : `prisma migrate dev` proposait ici de supprimer
-- "Agent_matricule_trgm_idx" — un index créé en SQL brut, donc invisible
-- de schema.prisma. Retiré à la main. Voir la note dans CLAUDE.md :
-- systématique, à revérifier à CHAQUE migration générée, quelle que soit
-- la méthode (--from-url ou shadow database).

-- AlterTable
ALTER TABLE "Document" ADD COLUMN     "supprimeLe" TIMESTAMP(3),
ADD COLUMN     "supprimeParId" TEXT;

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_supprimeParId_fkey" FOREIGN KEY ("supprimeParId") REFERENCES "Utilisateur"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
