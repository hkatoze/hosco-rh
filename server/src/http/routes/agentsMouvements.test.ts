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

describe("POST /api/agents/:id/mouvements", () => {
  const identifiants: Record<RoleUtilisateur, string> = {
    LECTURE: `test.mvt.lecture.${suffixe}`,
    SAISIE: `test.mvt.saisie.${suffixe}`,
    ADMIN: `test.mvt.admin.${suffixe}`,
  };
  const idsUtilisateurs: string[] = [];
  let serviceId: string;
  let cookieLecture: string;
  let cookieSaisie: string;
  let agentId: string;

  beforeAll(async () => {
    for (const [role, identifiant] of Object.entries(identifiants) as [RoleUtilisateur, string][]) {
      const u = await creerUtilisateurTest(identifiant, role);
      idsUtilisateurs.push(u.id);
    }
    const service = await prisma.service.findFirstOrThrow({ where: { actif: true } });
    serviceId = service.id;
    cookieLecture = await connexionTest(app, identifiants.LECTURE);
    cookieSaisie = await connexionTest(app, identifiants.SAISIE);
  });

  afterAll(async () => {
    await prisma.session.deleteMany({ where: { utilisateurId: { in: idsUtilisateurs } } });
    await prisma.journal.deleteMany({ where: { utilisateurId: { in: idsUtilisateurs } } });
    await prisma.utilisateur.deleteMany({ where: { id: { in: idsUtilisateurs } } });
  });

  beforeEach(async () => {
    const agent = await prisma.agent.create({
      data: {
        matricule: `ZZMVT-${suffixe}-${randomUUID().slice(0, 6)}`,
        nom: "ZzTestMouvement",
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
    await prisma.agent.delete({ where: { id: agentId } });
  });

  it("accepte un mouvement valide et journalise AJOUT_MOUVEMENT", async () => {
    const res = await poster(
      app,
      `/api/agents/${agentId}/mouvements`,
      { type: "CONGE", dateEffet: "2026-01-10", dateFin: "2026-01-20" },
      cookieSaisie,
    );
    expect(res.status).toBe(201);
    const entree = await prisma.journal.findFirst({ where: { action: "AJOUT_MOUVEMENT", cibleId: agentId } });
    expect(entree).not.toBeNull();
  });

  it("refus 1 : dateEffet antérieure à la date de recrutement", async () => {
    const res = await poster(app, `/api/agents/${agentId}/mouvements`, { type: "CONGE", dateEffet: "2019-01-01", dateFin: "2019-02-01" }, cookieSaisie);
    expect(res.status).toBe(422);
    expect((await json<CorpsErreur>(res)).error).toMatch(/antérieure à la date de recrutement/);
  });

  it("refus 2 : agent déjà dans un état définitif", async () => {
    await prisma.mouvement.create({ data: { agentId, type: "DEMISSION", dateEffet: new Date("2025-01-01"), saisiParId: idsUtilisateurs[0]! } });
    const res = await poster(app, `/api/agents/${agentId}/mouvements`, { type: "CONGE", dateEffet: "2026-01-10", dateFin: "2026-01-20" }, cookieSaisie);
    expect(res.status).toBe(422);
    expect((await json<CorpsErreur>(res)).error).toMatch(/état définitif/);
  });

  it("refus 3 : ouvrir un CONGE alors qu'un congé est déjà en cours", async () => {
    await poster(app, `/api/agents/${agentId}/mouvements`, { type: "CONGE", dateEffet: "2026-01-01", dateFin: "2026-12-31" }, cookieSaisie);
    const res = await poster(app, `/api/agents/${agentId}/mouvements`, { type: "CONGE", dateEffet: "2026-06-01", dateFin: "2026-06-10" }, cookieSaisie);
    expect(res.status).toBe(422);
    expect((await json<CorpsErreur>(res)).error).toMatch(/déjà en cours/);
  });

  it("refus 4 : FIN_SUSPENSION sans suspension en cours", async () => {
    const res = await poster(app, `/api/agents/${agentId}/mouvements`, { type: "FIN_SUSPENSION", dateEffet: "2026-01-10" }, cookieSaisie);
    expect(res.status).toBe(422);
    expect((await json<CorpsErreur>(res)).error).toMatch(/Aucune suspension en cours/);
  });

  it("refus 5 : CONGE sans dateFin", async () => {
    const res = await poster(app, `/api/agents/${agentId}/mouvements`, { type: "CONGE", dateEffet: "2026-01-10" }, cookieSaisie);
    expect(res.status).toBe(422);
    expect((await json<CorpsErreur>(res)).error).toMatch(/date de fin/);
  });

  it("LECTURE ne peut pas ajouter de mouvement (403)", async () => {
    const res = await poster(app, `/api/agents/${agentId}/mouvements`, { type: "CONGE", dateEffet: "2026-01-10", dateFin: "2026-01-20" }, cookieLecture);
    expect(res.status).toBe(403);
  });

  it("sans session : 401", async () => {
    const res = await poster(app, `/api/agents/${agentId}/mouvements`, { type: "CONGE", dateEffet: "2026-01-10", dateFin: "2026-01-20" });
    expect(res.status).toBe(401);
  });

  it("agent introuvable : 404", async () => {
    const res = await poster(app, `/api/agents/${randomUUID()}/mouvements`, { type: "CONGE", dateEffet: "2026-01-10", dateFin: "2026-01-20" }, cookieSaisie);
    expect(res.status).toBe(404);
  });
});
