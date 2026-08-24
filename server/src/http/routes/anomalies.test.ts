import { randomUUID } from "node:crypto";
import type { RoleUtilisateur } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "../../db";
import { creerApp } from "../app";
import { connexionTest, creerUtilisateurTest, obtenir } from "../testUtils";

const app = creerApp();
const suffixe = randomUUID().slice(0, 8);

interface LigneAnomalie {
  id: string;
  matricule: string;
  joursDepassement: number;
}

describe("GET /api/anomalies", () => {
  const identifiants: Record<RoleUtilisateur, string> = {
    LECTURE: `test.anomalies.lecture.${suffixe}`,
    SAISIE: `test.anomalies.saisie.${suffixe}`,
    ADMIN: `test.anomalies.admin.${suffixe}`,
  };
  const idsUtilisateurs: string[] = [];
  let cookieLecture: string;
  let agentId: string;

  beforeAll(async () => {
    for (const [role, identifiant] of Object.entries(identifiants) as [RoleUtilisateur, string][]) {
      const u = await creerUtilisateurTest(identifiant, role);
      idsUtilisateurs.push(u.id);
    }
    const service = await prisma.service.findFirstOrThrow({ where: { actif: true } });
    cookieLecture = await connexionTest(app, identifiants.LECTURE);

    const dateRecrutement = new Date("2020-01-01");
    const agent = await prisma.agent.create({
      data: {
        matricule: `ZZANOM-${suffixe}`,
        nom: "ZzTestAnomalie",
        prenom: "Fixture",
        sexe: "MASCULIN",
        fonction: "Testeur",
        dateRecrutement,
        typeContrat: "CDI",
        serviceId: service.id,
      },
    });
    agentId = agent.id;
    await prisma.mouvement.create({ data: { agentId, type: "RECRUTEMENT", dateEffet: dateRecrutement, saisiParId: idsUtilisateurs[0]! } });
    const dateFin = new Date();
    dateFin.setDate(dateFin.getDate() - 10);
    await prisma.mouvement.create({
      data: { agentId, type: "CONGE", dateEffet: new Date("2026-01-01"), dateFin, saisiParId: idsUtilisateurs[0]! },
    });
  });

  afterAll(async () => {
    // Garde-fou : si beforeAll a échoué avant d'assigner agentId, un
    // deleteMany({ where: { agentId: undefined } }) ne filtrerait sur RIEN
    // (Prisma ignore les clés undefined) et supprimerait TOUS les
    // mouvements de la base — déjà arrivé une fois, d'où cette garde.
    if (agentId) {
      await prisma.mouvement.deleteMany({ where: { agentId } });
      await prisma.agent.delete({ where: { id: agentId } });
    }
    await prisma.session.deleteMany({ where: { utilisateurId: { in: idsUtilisateurs } } });
    await prisma.journal.deleteMany({ where: { utilisateurId: { in: idsUtilisateurs } } });
    await prisma.utilisateur.deleteMany({ where: { id: { in: idsUtilisateurs } } });
  });

  it("liste l'agent en CONGE_DEPASSE avec ~10 jours de dépassement", async () => {
    const res = await obtenir(app, "/api/anomalies", cookieLecture);
    expect(res.status).toBe(200);
    const corps = (await res.json()) as LigneAnomalie[];
    const ligne = corps.find((a) => a.id === agentId);
    expect(ligne).toBeDefined();
    expect(ligne!.joursDepassement).toBeGreaterThanOrEqual(9);
    expect(ligne!.joursDepassement).toBeLessThanOrEqual(11);
  });

  it("nécessite au moins le rôle LECTURE (401 sans session)", async () => {
    expect((await obtenir(app, "/api/anomalies")).status).toBe(401);
  });
});
