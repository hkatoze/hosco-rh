import { randomUUID } from "node:crypto";
import type { RoleUtilisateur } from "@prisma/client";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "../../db";
import { creerApp } from "../app";
import { connexionTest, creerUtilisateurTest, entetes, json, poster } from "../testUtils";

const app = creerApp();
const suffixe = randomUUID().slice(0, 8);

interface Mouvement {
  id: string;
  type: string;
  agent: { matricule: string };
  annuleLe: string | null;
}
interface PageMouvements {
  donnees: Mouvement[];
  total: number;
}

describe("GET /api/mouvements (journal global)", () => {
  const identifiants: Record<RoleUtilisateur, string> = {
    LECTURE: `test.mvtliste.lecture.${suffixe}`,
    SAISIE: `test.mvtliste.saisie.${suffixe}`,
    ADMIN: `test.mvtliste.admin.${suffixe}`,
  };
  const idsUtilisateurs: string[] = [];
  let serviceId: string;
  let cookieLecture: string;
  let cookieSaisie: string;
  let cookieAdmin: string;
  let agentId: string;
  const matricule = `ZZMVTLISTE-${suffixe}`;

  beforeAll(async () => {
    for (const [role, identifiant] of Object.entries(identifiants) as [RoleUtilisateur, string][]) {
      const u = await creerUtilisateurTest(identifiant, role);
      idsUtilisateurs.push(u.id);
    }
    const service = await prisma.service.findFirstOrThrow({ where: { actif: true } });
    serviceId = service.id;
    cookieLecture = await connexionTest(app, identifiants.LECTURE);
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
        matricule,
        nom: "ZzTestMouvementListe",
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
    await poster(app, `/api/agents/${agentId}/mouvements`, { type: "CONGE", dateEffet: "2026-01-10", dateFin: "2026-01-20" }, cookieSaisie);
  });

  afterEach(async () => {
    if (!agentId) return;
    await prisma.journal.deleteMany({ where: { cibleType: "Agent", cibleId: agentId } });
    await prisma.mouvement.deleteMany({ where: { agentId } });
    await prisma.agent.deleteMany({ where: { id: agentId } });
  });

  it("liste les mouvements tous agents confondus, plus récent en premier", async () => {
    const res = await app.request(`/api/mouvements?q=ZzTestMouvementListe`, { headers: { Cookie: cookieLecture } });
    expect(res.status).toBe(200);
    const corps = await json<PageMouvements>(res);
    expect(corps.donnees).toHaveLength(2);
    expect(corps.donnees[0]!.type).toBe("CONGE");
    expect(corps.donnees[1]!.type).toBe("RECRUTEMENT");
    expect(corps.donnees[0]!.agent.matricule).toBe(matricule);
  });

  it("filtre par type", async () => {
    const res = await app.request(`/api/mouvements?q=ZzTestMouvementListe&type=CONGE`, { headers: { Cookie: cookieLecture } });
    const corps = await json<PageMouvements>(res);
    expect(corps.donnees).toHaveLength(1);
    expect(corps.donnees[0]!.type).toBe("CONGE");
  });

  it("exclut les mouvements annulés par défaut, les inclut avec inclureAnnules=true", async () => {
    const conge = await prisma.mouvement.findFirstOrThrow({ where: { agentId, type: "CONGE" } });
    await app.request(`/api/mouvements/${conge.id}/annuler`, {
      method: "POST",
      headers: entetes(cookieAdmin),
      body: JSON.stringify({ motif: "Erreur de saisie du congé" }),
    });

    const sansAnnules = await app.request(`/api/mouvements?q=ZzTestMouvementListe`, { headers: { Cookie: cookieLecture } });
    expect((await json<PageMouvements>(sansAnnules)).donnees).toHaveLength(1);

    const avecAnnules = await app.request(`/api/mouvements?q=ZzTestMouvementListe&inclureAnnules=true`, { headers: { Cookie: cookieLecture } });
    const corpsAvecAnnules = await json<PageMouvements>(avecAnnules);
    expect(corpsAvecAnnules.donnees).toHaveLength(2);
    expect(corpsAvecAnnules.donnees.find((m) => m.type === "CONGE")?.annuleLe).not.toBeNull();
  });

  it("nécessite une session valide (401)", async () => {
    const res = await app.request("/api/mouvements");
    expect(res.status).toBe(401);
  });
});
