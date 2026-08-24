import { randomUUID } from "node:crypto";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "../db";
import { verifierCoherenceDocuments, type RapportCoherence } from "./coherenceDocuments";

// La base contient d'autres documents/agents (seed, autres suites de test) :
// on ne regarde que les entrées liées aux ids créés par CE test.
function filtrerParIds(lignes: RapportCoherence["lignesSansFichier"], ids: string[]) {
  return lignes.filter((ligne) => ids.includes(ligne.id));
}

describe("verifierCoherenceDocuments", () => {
  let racine: string;
  let serviceId: string;
  let agentId: string;
  let utilisateurId: string;

  beforeEach(async () => {
    racine = await mkdtemp(path.join(tmpdir(), "hosco-coherence-"));

    const service = await prisma.service.create({
      data: { nom: `Service Cohérence ${randomUUID().slice(0, 6)}`, code: `COH${randomUUID().slice(0, 6)}`, actif: true },
    });
    serviceId = service.id;

    const agent = await prisma.agent.create({
      data: {
        matricule: `COH-${randomUUID().slice(0, 8)}`,
        nom: "Test",
        prenom: "Cohérence",
        sexe: "FEMININ",
        fonction: "Testeuse",
        dateRecrutement: new Date("2020-01-01"),
        typeContrat: "CDI",
        serviceId,
      },
    });
    agentId = agent.id;

    const utilisateur = await prisma.utilisateur.create({
      data: {
        identifiant: `test.coherence.${randomUUID().slice(0, 8)}`,
        nom: "T",
        motDePasseHash: "x",
        role: "ADMIN",
        actif: true,
        doitChangerMotDePasse: false,
      },
    });
    utilisateurId = utilisateur.id;
  });

  afterEach(async () => {
    await rm(racine, { recursive: true, force: true });
    // Garde-fou : si beforeEach a échoué avant d'assigner agentId, un
    // deleteMany({ where: { agentId: undefined } }) ne filtrerait sur RIEN
    // (Prisma ignore les clés undefined) et supprimerait TOUS les
    // documents de la base — déjà arrivé une fois, d'où cette garde.
    if (!agentId) return;
    await prisma.document.deleteMany({ where: { agentId } });
    await prisma.agent.delete({ where: { id: agentId } });
    await prisma.service.delete({ where: { id: serviceId } });
    await prisma.utilisateur.delete({ where: { id: utilisateurId } });
  });

  it("trouve un fichier orphelin (sur le disque, sans ligne en base)", async () => {
    const dossier = path.join(racine, "2026", agentId);
    await mkdir(dossier, { recursive: true });
    await writeFile(path.join(dossier, "orphelin.pdf"), "contenu");

    const rapport = await verifierCoherenceDocuments(racine);
    expect(rapport.fichiersOrphelins).toEqual([`2026/${agentId}/orphelin.pdf`]);
    expect(filtrerParIds(rapport.lignesSansFichier, [agentId])).toEqual([]);
  });

  it("trouve une ligne sans fichier (en base, absente du disque)", async () => {
    const document = await prisma.document.create({
      data: {
        agentId,
        type: "CV",
        nomOrigine: "cv.pdf",
        cheminFichier: "2026/inexistant/fichier.pdf",
        tailleOctets: 100,
        mimeType: "application/pdf",
        deposeParId: utilisateurId,
      },
    });

    const rapport = await verifierCoherenceDocuments(racine);
    expect(filtrerParIds(rapport.lignesSansFichier, [document.id])).toEqual([
      { source: "Document", id: document.id, cheminRelatif: "2026/inexistant/fichier.pdf" },
    ]);
    expect(rapport.fichiersOrphelins).toEqual([]);
  });

  it("trouve les deux cas simultanément, et ne signale pas un fichier correctement référencé", async () => {
    // Fichier cohérent : ne doit apparaître dans aucune des deux listes.
    const dossierCoherent = path.join(racine, "2026", agentId);
    await mkdir(dossierCoherent, { recursive: true });
    await writeFile(path.join(dossierCoherent, "coherent.pdf"), "contenu");
    await prisma.document.create({
      data: {
        agentId,
        type: "CV",
        nomOrigine: "cv.pdf",
        cheminFichier: `2026/${agentId}/coherent.pdf`,
        tailleOctets: 7,
        mimeType: "application/pdf",
        deposeParId: utilisateurId,
      },
    });

    // Fichier orphelin.
    await writeFile(path.join(dossierCoherent, "orphelin.pdf"), "contenu");

    // Ligne sans fichier.
    const documentCasse = await prisma.document.create({
      data: {
        agentId,
        type: "DIPLOME",
        nomOrigine: "diplome.pdf",
        cheminFichier: "2026/absent/diplome.pdf",
        tailleOctets: 100,
        mimeType: "application/pdf",
        deposeParId: utilisateurId,
      },
    });

    const rapport = await verifierCoherenceDocuments(racine);
    expect(rapport.fichiersOrphelins).toEqual([`2026/${agentId}/orphelin.pdf`]);
    expect(filtrerParIds(rapport.lignesSansFichier, [documentCasse.id])).toEqual([
      { source: "Document", id: documentCasse.id, cheminRelatif: "2026/absent/diplome.pdf" },
    ]);
  });

  it("prend en compte Agent.photoPath, pas seulement Document", async () => {
    await prisma.agent.update({ where: { id: agentId }, data: { photoPath: "2026/agents-photos/absent.jpg" } });

    const rapport = await verifierCoherenceDocuments(racine);
    expect(filtrerParIds(rapport.lignesSansFichier, [agentId])).toEqual([
      { source: "Agent.photoPath", id: agentId, cheminRelatif: "2026/agents-photos/absent.jpg" },
    ]);
  });
});
