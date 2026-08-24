import { randomUUID } from "node:crypto";
import type { RoleUtilisateur } from "@prisma/client";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "../../db";
import { creerApp } from "../app";
import { connexionTest, creerUtilisateurTest, json, supprimer } from "../testUtils";

const app = creerApp();
const suffixe = randomUUID().slice(0, 8);

describe("DELETE /api/agents/:id (suppression douce)", () => {
  const identifiants: Record<RoleUtilisateur, string> = {
    LECTURE: `test.suppr.lecture.${suffixe}`,
    SAISIE: `test.suppr.saisie.${suffixe}`,
    ADMIN: `test.suppr.admin.${suffixe}`,
  };
  const idsUtilisateurs: string[] = [];
  let serviceId: string;
  let cookieSaisie: string;
  let cookieAdmin: string;
  let agentId: string;

  beforeAll(async () => {
    for (const [role, identifiant] of Object.entries(identifiants) as [RoleUtilisateur, string][]) {
      const u = await creerUtilisateurTest(identifiant, role);
      idsUtilisateurs.push(u.id);
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
        matricule: `ZZSUP-${suffixe}-${randomUUID().slice(0, 6)}`,
        nom: "ZzTestSuppression",
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
      data: { agentId, type: "RECRUTEMENT", dateEffet: new Date("2020-01-01"), saisiParId: idsUtilisateurs[0]! },
    });
  });

  afterEach(async () => {
    // Garde-fou : si beforeEach a échoué avant d'assigner agentId, un
    // deleteMany({ where: { agentId: undefined } }) ne filtrerait sur RIEN
    // (Prisma ignore les clés undefined) et supprimerait TOUS les
    // mouvements de la base — déjà arrivé une fois, d'où cette garde.
    if (!agentId) return;
    await prisma.journal.deleteMany({ where: { cibleType: "Agent", cibleId: agentId } });
    await prisma.mouvement.deleteMany({ where: { agentId } });
    await prisma.agent.deleteMany({ where: { id: agentId } });
  });

  it("ADMIN supprime (doucement) un agent, journalise SUPPRESSION_AGENT, ligne et mouvements conservés en base", async () => {
    const res = await supprimer(app, `/api/agents/${agentId}`, cookieAdmin);
    expect(res.status).toBe(200);

    const agentEnBase = await prisma.agent.findUnique({ where: { id: agentId } });
    expect(agentEnBase).not.toBeNull();
    expect(agentEnBase!.supprimeLe).not.toBeNull();
    expect(agentEnBase!.supprimeParId).not.toBeNull();

    const mouvements = await prisma.mouvement.findMany({ where: { agentId } });
    expect(mouvements).toHaveLength(1);

    const entree = await prisma.journal.findFirst({ where: { action: "SUPPRESSION_AGENT", cibleId: agentId } });
    expect(entree).not.toBeNull();
  });

  it("l'agent supprimé disparaît de l'annuaire", async () => {
    await supprimer(app, `/api/agents/${agentId}`, cookieAdmin);

    const res = await app.request(`/api/agents?q=ZzTestSuppression`, { headers: { Cookie: cookieAdmin } });
    const corps = await json<{ donnees: Array<{ id: string }> }>(res);
    expect(corps.donnees.find((a) => a.id === agentId)).toBeUndefined();
  });

  it("la fiche d'un agent supprimé renvoie 404", async () => {
    await supprimer(app, `/api/agents/${agentId}`, cookieAdmin);

    const res = await app.request(`/api/agents/${agentId}`, { headers: { Cookie: cookieAdmin } });
    expect(res.status).toBe(404);
  });

  it("SAISIE ne peut pas supprimer un agent (403)", async () => {
    const res = await supprimer(app, `/api/agents/${agentId}`, cookieSaisie);
    expect(res.status).toBe(403);
  });

  it("sans session : 401", async () => {
    const res = await supprimer(app, `/api/agents/${agentId}`);
    expect(res.status).toBe(401);
  });

  it("agent déjà supprimé : 404 (pas de double suppression)", async () => {
    await supprimer(app, `/api/agents/${agentId}`, cookieAdmin);
    const res = await supprimer(app, `/api/agents/${agentId}`, cookieAdmin);
    expect(res.status).toBe(404);
  });

  it("agent introuvable : 404", async () => {
    const res = await supprimer(app, `/api/agents/${randomUUID()}`, cookieAdmin);
    expect(res.status).toBe(404);
  });
});
