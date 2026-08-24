-- CreateEnum
CREATE TYPE "Sexe" AS ENUM ('MASCULIN', 'FEMININ');

-- CreateEnum
CREATE TYPE "TypeMouvement" AS ENUM ('RECRUTEMENT', 'CONGE', 'RETOUR_CONGE', 'SUSPENSION', 'DEMISSION', 'LICENCIEMENT', 'RETRAITE', 'DECES');

-- CreateEnum
CREATE TYPE "TypeDocument" AS ENUM ('CV', 'DIPLOME', 'CONTRAT', 'CNIB', 'ACTE_NAISSANCE', 'CERTIFICAT_MEDICAL', 'AUTRE');

-- CreateEnum
CREATE TYPE "RoleUtilisateur" AS ENUM ('LECTURE', 'SAISIE', 'ADMIN');

-- CreateTable
CREATE TABLE "Service" (
    "id" TEXT NOT NULL,
    "nom" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "actif" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "Service_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Agent" (
    "id" TEXT NOT NULL,
    "matricule" TEXT NOT NULL,
    "nom" TEXT NOT NULL,
    "prenom" TEXT NOT NULL,
    "sexe" "Sexe" NOT NULL,
    "dateNaissance" TIMESTAMP(3),
    "lieuNaissance" TEXT,
    "situationMatrimoniale" TEXT,
    "telephone" TEXT,
    "adresse" TEXT,
    "numeroCnss" TEXT,
    "fonction" TEXT NOT NULL,
    "dateRecrutement" TIMESTAMP(3) NOT NULL,
    "typeContrat" TEXT NOT NULL,
    "photoPath" TEXT,
    "serviceId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Agent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Mouvement" (
    "id" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "type" "TypeMouvement" NOT NULL,
    "dateEffet" TIMESTAMP(3) NOT NULL,
    "dateFin" TIMESTAMP(3),
    "motif" TEXT,
    "documentId" TEXT,
    "saisiParId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Mouvement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Document" (
    "id" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "type" "TypeDocument" NOT NULL,
    "nomOrigine" TEXT NOT NULL,
    "cheminFichier" TEXT NOT NULL,
    "tailleOctets" INTEGER NOT NULL,
    "mimeType" TEXT NOT NULL,
    "deposeParId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Document_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Utilisateur" (
    "id" TEXT NOT NULL,
    "identifiant" TEXT NOT NULL,
    "nom" TEXT NOT NULL,
    "motDePasseHash" TEXT NOT NULL,
    "role" "RoleUtilisateur" NOT NULL,
    "actif" BOOLEAN NOT NULL DEFAULT true,
    "dernierAcces" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Utilisateur_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Journal" (
    "id" TEXT NOT NULL,
    "utilisateurId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "cibleType" TEXT NOT NULL,
    "cibleId" TEXT NOT NULL,
    "detail" JSONB,
    "adresseIp" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Journal_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Service_code_key" ON "Service"("code");

-- CreateIndex
CREATE UNIQUE INDEX "Agent_matricule_key" ON "Agent"("matricule");

-- CreateIndex
CREATE INDEX "Agent_nom_prenom_idx" ON "Agent"("nom", "prenom");

-- CreateIndex
CREATE INDEX "Agent_serviceId_idx" ON "Agent"("serviceId");

-- CreateIndex
CREATE UNIQUE INDEX "Mouvement_documentId_key" ON "Mouvement"("documentId");

-- CreateIndex
CREATE INDEX "Mouvement_agentId_dateEffet_idx" ON "Mouvement"("agentId", "dateEffet");

-- CreateIndex
CREATE INDEX "Document_agentId_idx" ON "Document"("agentId");

-- CreateIndex
CREATE UNIQUE INDEX "Utilisateur_identifiant_key" ON "Utilisateur"("identifiant");

-- CreateIndex
CREATE INDEX "Journal_createdAt_idx" ON "Journal"("createdAt");

-- CreateIndex
CREATE INDEX "Journal_cibleType_cibleId_idx" ON "Journal"("cibleType", "cibleId");

-- AddForeignKey
ALTER TABLE "Agent" ADD CONSTRAINT "Agent_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "Service"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Mouvement" ADD CONSTRAINT "Mouvement_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "Agent"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Mouvement" ADD CONSTRAINT "Mouvement_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Mouvement" ADD CONSTRAINT "Mouvement_saisiParId_fkey" FOREIGN KEY ("saisiParId") REFERENCES "Utilisateur"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "Agent"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_deposeParId_fkey" FOREIGN KEY ("deposeParId") REFERENCES "Utilisateur"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Journal" ADD CONSTRAINT "Journal_utilisateurId_fkey" FOREIGN KEY ("utilisateurId") REFERENCES "Utilisateur"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
