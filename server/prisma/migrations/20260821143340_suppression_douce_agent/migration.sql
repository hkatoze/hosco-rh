-- AlterTable
ALTER TABLE "Agent" ADD COLUMN     "supprimeLe" TIMESTAMP(3),
ADD COLUMN     "supprimeParId" TEXT;

-- AddForeignKey
ALTER TABLE "Agent" ADD CONSTRAINT "Agent_supprimeParId_fkey" FOREIGN KEY ("supprimeParId") REFERENCES "Utilisateur"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
