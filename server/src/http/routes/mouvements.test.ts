import { randomUUID } from "node:crypto";
import type { RoleUtilisateur } from "@prisma/client";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "../../db";
import { creerApp } from "../app";
import { connexionTest, creerUtilisateurTest, json, poster } from "../testUtils";

const app = creerApp();
const suffixe = randomUUID().slice(0, 8);

interface CorpsErreur {
  error?: string;
}

describe("POST /api/mouvements/:id/annuler", () => {
  const identifiants: Record<RoleUtilisateur, string> = {
    LECTURE: `test.annul.lecture.${suffixe}`,
    SAISIE: `test.annul.saisie.${suffixe}`,
    ADMIN: `test.annul.admin.${suffixe}`,
  };
  const idsUtilisateurs: string[] = [];
  const idsParRole: Record<RoleUtilisateur, string> = { LECTURE: "", SAISIE: "", ADMIN: "" };
  let serviceId: string;
  let cookieSaisie: string;
  let cookieAdmin: string;
  let agentId: string;
  let mouvementId: string;

  beforeAll(async () => {
    for (const [role, identifiant] of Object.entries(identifiants) as [RoleUtilisateur, string][]) {
      const u = await creerUtilisateurTest(identifiant, role);
      idsUtilisateurs.push(u.id);
      idsParRole[role] = u.id;
    }
    const service = await prisma.service.findFirstOrThrow({ where: { actif: true } });
    serviceId = service.id;
    cookieSaisie = await connexionTest(app, identifiants.SAISIE);
    cookieAdmin = await connexionTest(app, identifiants.ADMIN);
  });

  afterAll(async () => {
    await prisma.session.deleteMany({ where: { utilisateurId: { in: idsUtilisateurs } } });
    await prisma.journal.deleteMany({ where: { utilisateurId: { in: idsUtilisateurs } } });
    await prisma.utilisateur.deleteMany({ where: { id: { in: idsUtilisateurs } } });
  });

  beforeEach(async () => {
    const agent = await prisma.agent.create({
      data: {
        matricule: `ZZANN-${suffixe}-${randomUUID().slice(0, 6)}`,
        nom: "ZzTestAnnulation",
        prenom: "Fixture",
        sexe: "MASCULIN",
        fonction: "Testeur",
        dateRecrutement: new Date("2020-01-01"),
        typeContrat: "CDI",
        serviceId,
      },
    });
    agentId = agent.id;
    await prisma.mouvement.create({
      data: { agentId, type: "RECRUTEMENT", dateEffet: new Date("2020-01-01"), saisiParId: idsParRole.SAISIE },
    });
    const demission = await prisma.mouvement.create({
      data: { agentId, type: "DEMISSION", dateEffet: new Date("2025-01-01"), saisiParId: idsParRole.SAISIE },
    });
    mouvementId = demission.id;
  });

  afterEach(async () => {
    // Garde-fou : si beforeEach a échoué avant d'assigner agentId, un
    // deleteMany({ where: { agentId: undefined } }) ne filtrerait sur RIEN
    // (Prisma ignore les clés undefined) et supprimerait TOUS les
    // mouvements de la base — déjà arrivé une fois, d'où cette garde.
    if (!agentId) return;
    await prisma.journal.deleteMany({ where: { OR: [{ cibleType: "Agent", cibleId: agentId }, { cibleType: "Mouvement" }] } });
    await prisma.mouvement.deleteMany({ where: { agentId } });
    await prisma.agent.delete({ where: { id: agentId } });
  });

  it("ADMIN annule un mouvement, journalise ANNULATION_MOUVEMENT et le statut est recalculé sans lui", async () => {
    const res = await poster(app, `/api/mouvements/${mouvementId}/annuler`, { motif: "Erreur de saisie du type de mouvement" }, cookieAdmin);
    expect(res.status).toBe(200);
    const corps = await json<{ mouvement: { annuleLe: string | null }; statut: string }>(res);
    expect(corps.mouvement.annuleLe).not.toBeNull();
    expect(corps.statut).toBe("PRESENT");

    const entree = await prisma.journal.findFirst({ where: { action: "ANNULATION_MOUVEMENT", cibleId: mouvementId } });
    expect(entree).not.toBeNull();
    expect((entree?.detail as { motif?: string } | null)?.motif).toBe("Erreur de saisie du type de mouvement");
  });

  it("refuse un motif de moins de 10 caractères (400)", async () => {
    const res = await poster(app, `/api/mouvements/${mouvementId}/annuler`, { motif: "trop bref" }, cookieAdmin);
    expect(res.status).toBe(400);
  });

  it("refuse d'annuler un mouvement déjà annulé (422)", async () => {
    await poster(app, `/api/mouvements/${mouvementId}/annuler`, { motif: "Première annulation valide" }, cookieAdmin);
    const res = await poster(app, `/api/mouvements/${mouvementId}/annuler`, { motif: "Deuxième tentative invalide" }, cookieAdmin);
    expect(res.status).toBe(422);
    expect((await json<CorpsErreur>(res)).error).toMatch(/déjà annulé/);
  });

  it("SAISIE ne peut pas annuler un mouvement (403)", async () => {
    const res = await poster(app, `/api/mouvements/${mouvementId}/annuler`, { motif: "Tentative non autorisée ici" }, cookieSaisie);
    expect(res.status).toBe(403);
  });

  it("sans session : 401", async () => {
    const res = await poster(app, `/api/mouvements/${mouvementId}/annuler`, { motif: "Tentative sans session valide" });
    expect(res.status).toBe(401);
  });

  it("mouvement introuvable : 404", async () => {
    const res = await poster(app, `/api/mouvements/${randomUUID()}/annuler`, { motif: "Mouvement inexistant en base" }, cookieAdmin);
    expect(res.status).toBe(404);
  });
});
