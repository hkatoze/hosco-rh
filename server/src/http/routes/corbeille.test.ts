import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type { RoleUtilisateur } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { config } from "../../config";
import { prisma } from "../../db";
import { creerApp } from "../app";
import { connexionTest, creerUtilisateurTest, entetes } from "../testUtils";

const app = creerApp();
const suffixe = randomUUID().slice(0, 8);

const PNG_1X1 = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
  "base64",
);

describe("Corbeille (Paramètres)", () => {
  const identifiants: Record<RoleUtilisateur, string> = {
    LECTURE: `test.corbeille.lecture.${suffixe}`,
    SAISIE: `test.corbeille.saisie.${suffixe}`,
    ADMIN: `test.corbeille.admin.${suffixe}`,
  };
  const idsUtilisateurs: string[] = [];
  let serviceId: string;
  let cookieAdmin: string;
  let cookieSaisie: string;
  let racineOriginale: string;
  let agentId: string;
  let documentId: string;

  beforeAll(async () => {
    racineOriginale = config.documentsRacine;
    config.documentsRacine = await mkdtemp(path.join(tmpdir(), "hosco-corbeille-http-"));

    for (const [role, identifiant] of Object.entries(identifiants) as [RoleUtilisateur, string][]) {
      const u = await creerUtilisateurTest(identifiant, role);
      idsUtilisateurs.push(u.id);
    }
    const service = await prisma.service.findFirstOrThrow({ where: { actif: true } });
    serviceId = service.id;
    cookieAdmin = await connexionTest(app, identifiants.ADMIN);
    cookieSaisie = await connexionTest(app, identifiants.SAISIE);
  });

  afterAll(async () => {
    await rm(config.documentsRacine, { recursive: true, force: true });
    config.documentsRacine = racineOriginale;
    await prisma.session.deleteMany({ where: { utilisateurId: { in: idsUtilisateurs } } });
    await prisma.journal.deleteMany({ where: { utilisateurId: { in: idsUtilisateurs } } });
    await prisma.utilisateur.deleteMany({ where: { id: { in: idsUtilisateurs } } });
  });

  beforeAll(async () => {
    const agent = await prisma.agent.create({
      data: {
        matricule: `ZZCORB-${suffixe}`,
        nom: "ZzTestCorbeille",
        prenom: "Fixture",
        sexe: "MASCULIN",
        fonction: "Testeur",
        dateRecrutement: new Date("2020-01-01"),
        typeContrat: "CDI",
        serviceId,
      },
    });
    agentId = agent.id;

    const formulaire = new FormData();
    formulaire.append("type", "CV");
    formulaire.append("fichier", new Blob([PNG_1X1], { type: "image/png" }), "photo.png");
    const upload = await app.request(`/api/agents/${agentId}/documents`, {
      method: "POST",
      headers: { Origin: "http://localhost:5173", Cookie: cookieSaisie },
      body: formulaire,
    });
    const corpsUpload = (await upload.json()) as { id: string };
    documentId = corpsUpload.id;

    await app.request(`/api/documents/${documentId}`, { method: "DELETE", headers: entetes(cookieAdmin) });
    await app.request(`/api/agents/${agentId}`, { method: "DELETE", headers: entetes(cookieAdmin) });
  });

  afterAll(async () => {
    // Garde-fou : si le beforeAll précédent a échoué avant d'assigner
    // agentId, un deleteMany({ where: { agentId: undefined } }) ne
    // filtrerait sur RIEN (Prisma ignore les clés undefined) et
    // supprimerait TOUS les documents/agents de la base.
    if (!agentId) return;
    await prisma.journal.deleteMany({ where: { OR: [{ cibleType: "Agent", cibleId: agentId }, { cibleType: "Document", cibleId: documentId }] } });
    await prisma.document.deleteMany({ where: { agentId } });
    await prisma.agent.deleteMany({ where: { id: agentId } });
  });

  it("LECTURE et SAISIE ne peuvent pas voir la corbeille (403)", async () => {
    const res = await app.request("/api/corbeille", { headers: entetes(cookieSaisie) });
    expect(res.status).toBe(403);
  });

  it("ADMIN voit le document et l'agent supprimés, avec le nombre de jours restants", async () => {
    const res = await app.request("/api/corbeille", { headers: entetes(cookieAdmin) });
    expect(res.status).toBe(200);
    const corps = (await res.json()) as {
      documents: Array<{ id: string; joursRestants: number }>;
      agents: Array<{ id: string; joursRestants: number }>;
    };
    const document = corps.documents.find((d) => d.id === documentId);
    const agent = corps.agents.find((a) => a.id === agentId);
    expect(document).toBeDefined();
    expect(agent).toBeDefined();
    expect(document!.joursRestants).toBeGreaterThan(85);
    expect(agent!.joursRestants).toBeGreaterThan(85);
  });

  it("restaure un document : réapparaît sur la fiche agent, disparaît de la corbeille", async () => {
    const res = await app.request(`/api/corbeille/documents/${documentId}/restaurer`, { method: "POST", headers: entetes(cookieAdmin) });
    expect(res.status).toBe(200);

    const document = await prisma.document.findUnique({ where: { id: documentId } });
    expect(document?.supprimeLe).toBeNull();

    const entree = await prisma.journal.findFirst({ where: { action: "RESTAURATION_DOCUMENT", cibleId: documentId } });
    expect(entree).not.toBeNull();
  });

  it("restaure un agent : redevient visible dans l'annuaire", async () => {
    const res = await app.request(`/api/corbeille/agents/${agentId}/restaurer`, { method: "POST", headers: entetes(cookieAdmin) });
    expect(res.status).toBe(200);

    const agent = await prisma.agent.findUnique({ where: { id: agentId } });
    expect(agent?.supprimeLe).toBeNull();

    const entree = await prisma.journal.findFirst({ where: { action: "RESTAURATION_AGENT", cibleId: agentId } });
    expect(entree).not.toBeNull();
  });
});
