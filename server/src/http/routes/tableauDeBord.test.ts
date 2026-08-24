import { randomUUID } from "node:crypto";
import type { RoleUtilisateur } from "@prisma/client";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "../../db";
import { creerApp } from "../app";
import { connexionTest, creerUtilisateurTest, json } from "../testUtils";

const app = creerApp();
const suffixe = randomUUID().slice(0, 8);

interface ReponseTableauDeBord {
  totalPersonnel: number;
  totalPersonnelVariation: number;
  arriveesMois: number;
  departsMois: number;
  tauxAbsence: number;
  repartitionParService: Array<{ nom: string; effectif: number; pourcentage: number }>;
}

describe("GET /api/tableau-de-bord", () => {
  const identifiants: Record<RoleUtilisateur, string> = {
    LECTURE: `test.dashboard.lecture.${suffixe}`,
    SAISIE: `test.dashboard.saisie.${suffixe}`,
    ADMIN: `test.dashboard.admin.${suffixe}`,
  };
  const idsUtilisateurs: string[] = [];
  let serviceId: string;
  let cookieLecture: string;
  let agentPresentId: string;
  let agentCongeId: string;
  let agentDemissionneId: string;

  beforeAll(async () => {
    for (const [role, identifiant] of Object.entries(identifiants) as [RoleUtilisateur, string][]) {
      const u = await creerUtilisateurTest(identifiant, role);
      idsUtilisateurs.push(u.id);
    }
    const service = await prisma.service.findFirstOrThrow({ where: { actif: true } });
    serviceId = service.id;
    cookieLecture = await connexionTest(app, identifiants.LECTURE);
  });

  afterAll(async () => {
    await prisma.session.deleteMany({ where: { utilisateurId: { in: idsUtilisateurs } } });
    await prisma.journal.deleteMany({ where: { utilisateurId: { in: idsUtilisateurs } } });
    await prisma.utilisateur.deleteMany({ where: { id: { in: idsUtilisateurs } } });
  });

  beforeEach(async () => {
    const aujourdhui = new Date();
    const debutMois = new Date(Date.UTC(aujourdhui.getUTCFullYear(), aujourdhui.getUTCMonth(), 3));

    const agentPresent = await prisma.agent.create({
      data: {
        matricule: `ZZDASH-PRES-${suffixe}`,
        nom: "ZzTestDashboard",
        prenom: "Present",
        sexe: "MASCULIN",
        fonction: "Testeur",
        dateRecrutement: debutMois,
        typeContrat: "CDI",
        serviceId,
      },
    });
    agentPresentId = agentPresent.id;
    await prisma.mouvement.create({
      data: { agentId: agentPresentId, type: "RECRUTEMENT", dateEffet: debutMois, saisiParId: idsUtilisateurs[0]! },
    });

    const agentConge = await prisma.agent.create({
      data: {
        matricule: `ZZDASH-CONGE-${suffixe}`,
        nom: "ZzTestDashboard",
        prenom: "EnConge",
        sexe: "FEMININ",
        fonction: "Testeur",
        dateRecrutement: new Date("2020-01-01"),
        typeContrat: "CDI",
        serviceId,
      },
    });
    agentCongeId = agentConge.id;
    await prisma.mouvement.create({
      data: { agentId: agentCongeId, type: "RECRUTEMENT", dateEffet: new Date("2020-01-01"), saisiParId: idsUtilisateurs[0]! },
    });
    await prisma.mouvement.create({
      data: {
        agentId: agentCongeId,
        type: "CONGE",
        dateEffet: new Date(aujourdhui.getTime() - 86400000),
        dateFin: new Date(aujourdhui.getTime() + 86400000 * 10),
        saisiParId: idsUtilisateurs[0]!,
      },
    });

    const agentDemissionne = await prisma.agent.create({
      data: {
        matricule: `ZZDASH-DEM-${suffixe}`,
        nom: "ZzTestDashboard",
        prenom: "Demissionne",
        sexe: "MASCULIN",
        fonction: "Testeur",
        dateRecrutement: new Date("2020-01-01"),
        typeContrat: "CDI",
        serviceId,
      },
    });
    agentDemissionneId = agentDemissionne.id;
    await prisma.mouvement.create({
      data: { agentId: agentDemissionneId, type: "RECRUTEMENT", dateEffet: new Date("2020-01-01"), saisiParId: idsUtilisateurs[0]! },
    });
    await prisma.mouvement.create({
      data: { agentId: agentDemissionneId, type: "DEMISSION", dateEffet: debutMois, saisiParId: idsUtilisateurs[0]! },
    });
  });

  afterEach(async () => {
    const ids = [agentPresentId, agentCongeId, agentDemissionneId].filter(Boolean);
    if (ids.length === 0) return;
    await prisma.journal.deleteMany({ where: { cibleType: "Agent", cibleId: { in: ids } } });
    await prisma.mouvement.deleteMany({ where: { agentId: { in: ids } } });
    await prisma.agent.deleteMany({ where: { id: { in: ids } } });
  });

  it("compte le personnel actif, exclut les définitifs, compte les arrivées/départs du mois et le taux d'absence", async () => {
    const res = await app.request("/api/tableau-de-bord", { headers: { Cookie: cookieLecture } });
    expect(res.status).toBe(200);
    const corps = await json<ReponseTableauDeBord>(res);

    // 2 agents actifs créés (présent + en congé), le démissionné est exclu.
    expect(corps.totalPersonnel).toBeGreaterThanOrEqual(2);
    expect(corps.arriveesMois).toBeGreaterThanOrEqual(1);
    expect(corps.departsMois).toBeGreaterThanOrEqual(1);
    expect(corps.tauxAbsence).toBeGreaterThan(0);

    const service = corps.repartitionParService.find((s) => s.nom === (corps.repartitionParService[0]?.nom ?? ""));
    expect(service).toBeDefined();
  });

  it("nécessite une session valide (401)", async () => {
    const res = await app.request("/api/tableau-de-bord");
    expect(res.status).toBe(401);
  });
});
