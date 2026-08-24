import { randomUUID } from "node:crypto";
import type { RoleUtilisateur, TypeMouvement } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "../../db";
import type { StatutAgent } from "../../domain/statut";
import { creerApp } from "../app";
import { connexionTest, creerUtilisateurTest, entetes, json, obtenir, patcher, poster } from "../testUtils";

const app = creerApp();
const suffixe = randomUUID().slice(0, 8);

interface AgentListe {
  id: string;
  matricule: string;
  nom: string;
  prenom: string;
  statut: StatutAgent;
  service: { id: string; nom: string };
}
interface ReponseListe {
  donnees: AgentListe[];
  page: number;
  taille: number;
  total: number;
}
interface CorpsErreur {
  error?: string;
}

function joursDecales(n: number): Date {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() + n);
  return d;
}

describe("API Agents", () => {
  const identifiants: Record<RoleUtilisateur, string> = {
    LECTURE: `test.agents.lecture.${suffixe}`,
    SAISIE: `test.agents.saisie.${suffixe}`,
    ADMIN: `test.agents.admin.${suffixe}`,
  };
  const idsUtilisateurs: string[] = [];
  let serviceId: string;
  let cookieLecture: string;
  let cookieSaisie: string;

  const idsAgentsCrees: string[] = [];
  const casStatuts: Array<{ statut: StatutAgent; type: TypeMouvement; dateEffet: Date; dateFin: Date | null }> = [
    { statut: "PRESENT", type: "RECRUTEMENT", dateEffet: joursDecales(-400), dateFin: null },
    { statut: "EN_CONGE", type: "CONGE", dateEffet: joursDecales(-5), dateFin: joursDecales(5) },
    { statut: "CONGE_DEPASSE", type: "CONGE", dateEffet: joursDecales(-30), dateFin: joursDecales(-5) },
    { statut: "SUSPENDU", type: "SUSPENSION", dateEffet: joursDecales(-5), dateFin: null },
    { statut: "DEMISSIONNE", type: "DEMISSION", dateEffet: joursDecales(-5), dateFin: null },
    { statut: "LICENCIE", type: "LICENCIEMENT", dateEffet: joursDecales(-5), dateFin: null },
    { statut: "RETRAITE", type: "RETRAITE", dateEffet: joursDecales(-5), dateFin: null },
    { statut: "DECEDE", type: "DECES", dateEffet: joursDecales(-5), dateFin: null },
  ];

  beforeAll(async () => {
    for (const [role, identifiant] of Object.entries(identifiants) as [RoleUtilisateur, string][]) {
      const u = await creerUtilisateurTest(identifiant, role);
      idsUtilisateurs.push(u.id);
    }
    const service = await prisma.service.findFirstOrThrow({ where: { actif: true } });
    serviceId = service.id;
    cookieLecture = await connexionTest(app, identifiants.LECTURE);
    cookieSaisie = await connexionTest(app, identifiants.SAISIE);

    const dateRecrutement = joursDecales(-500);
    for (const cas of casStatuts) {
      const agent = await prisma.agent.create({
        data: {
          matricule: `ZZTEST-${suffixe}-${cas.statut}`,
          nom: `ZzTestStatut${cas.statut}`,
          prenom: "Fixture",
          sexe: "MASCULIN",
          fonction: "Testeur",
          dateRecrutement,
          typeContrat: "CDI",
          serviceId,
        },
      });
      idsAgentsCrees.push(agent.id);
      await prisma.mouvement.create({
        data: { agentId: agent.id, type: "RECRUTEMENT", dateEffet: dateRecrutement, saisiParId: idsUtilisateurs[0]! },
      });
      if (cas.type !== "RECRUTEMENT") {
        await prisma.mouvement.create({
          data: { agentId: agent.id, type: cas.type, dateEffet: cas.dateEffet, dateFin: cas.dateFin, saisiParId: idsUtilisateurs[0]! },
        });
      }
    }
  });

  afterAll(async () => {
    await prisma.mouvement.deleteMany({ where: { agentId: { in: idsAgentsCrees } } });
    await prisma.journal.deleteMany({ where: { utilisateurId: { in: idsUtilisateurs } } });
    await prisma.journal.deleteMany({ where: { cibleType: "Agent", cibleId: { in: idsAgentsCrees } } });
    await prisma.agent.deleteMany({ where: { id: { in: idsAgentsCrees } } });
    await prisma.session.deleteMany({ where: { utilisateurId: { in: idsUtilisateurs } } });
    await prisma.utilisateur.deleteMany({ where: { id: { in: idsUtilisateurs } } });
  });

  describe("les 8 statuts", () => {
    it.each(casStatuts.map((c) => c.statut))("un agent en %s est classé correctement par la fiche et le filtre", async (statutAttendu) => {
      const cas = casStatuts.find((c) => c.statut === statutAttendu)!;
      const agentId = idsAgentsCrees[casStatuts.indexOf(cas)]!;

      const fiche = await obtenir(app, `/api/agents/${agentId}`, cookieLecture);
      expect(fiche.status).toBe(200);
      expect((await json<{ statut: StatutAgent }>(fiche)).statut).toBe(statutAttendu);

      const liste = await obtenir(app, `/api/agents?statut=${statutAttendu}&q=ZzTestStatut${statutAttendu}`, cookieLecture);
      expect(liste.status).toBe(200);
      const corpsListe = await json<ReponseListe>(liste);
      expect(corpsListe.donnees.some((a) => a.id === agentId)).toBe(true);
    });
  });

  describe("recherche insensible aux accents", () => {
    it("un terme sans accent trouve un agent accentué (OUEDRAOGO -> Ouédraogo)", async () => {
      const res = await obtenir(app, "/api/agents?q=OUEDRAOGO", cookieLecture);
      expect(res.status).toBe(200);
      const corps = await json<ReponseListe>(res);
      expect(corps.donnees.length).toBeGreaterThan(0);
      expect(corps.donnees.every((a) => a.nom.toUpperCase().includes("OUÉDRAOGO") || a.nom.toUpperCase() === "OUÉDRAOGO")).toBe(true);
    });

    it("recherche par matricule", async () => {
      const cible = idsAgentsCrees[0]!;
      const agent = await prisma.agent.findUniqueOrThrow({ where: { id: cible } });
      const res = await obtenir(app, `/api/agents?q=${encodeURIComponent(agent.matricule)}`, cookieLecture);
      const corps = await json<ReponseListe>(res);
      expect(corps.donnees.some((a) => a.id === cible)).toBe(true);
    });

    it("journalise l'action RECHERCHE avec les critères", async () => {
      await obtenir(app, "/api/agents?q=OUEDRAOGO", cookieLecture);
      const entree = await prisma.journal.findFirst({
        where: { action: "RECHERCHE", cibleType: "Agent" },
        orderBy: { createdAt: "desc" },
      });
      expect(entree).not.toBeNull();
      expect((entree?.detail as { q?: string } | null)?.q).toBe("OUEDRAOGO");
    });
  });

  describe("pagination", () => {
    it("taille par défaut 25, page 1 par défaut", async () => {
      const res = await obtenir(app, "/api/agents", cookieLecture);
      const corps = await json<ReponseListe>(res);
      expect(corps.page).toBe(1);
      expect(corps.taille).toBe(25);
      expect(corps.donnees.length).toBeLessThanOrEqual(25);
      expect(corps.total).toBeGreaterThan(25);
    });

    it("taille plafonnée à 100", async () => {
      const res = await obtenir(app, "/api/agents?taille=500", cookieLecture);
      const corps = await json<ReponseListe>(res);
      expect(corps.taille).toBe(100);
    });

    it("page 2 renvoie des agents différents de la page 1", async () => {
      const p1 = await json<ReponseListe>(await obtenir(app, "/api/agents?taille=5&page=1&tri=matricule", cookieLecture));
      const p2 = await json<ReponseListe>(await obtenir(app, "/api/agents?taille=5&page=2&tri=matricule", cookieLecture));
      const idsP1 = new Set(p1.donnees.map((a) => a.id));
      expect(p2.donnees.some((a) => idsP1.has(a.id))).toBe(false);
    });
  });

  describe("création et modification", () => {
    it("POST crée un agent avec son mouvement RECRUTEMENT, matricule immuable ensuite", async () => {
      const matricule = `ZZCREE-${suffixe}`;
      const res = await poster(
        app,
        "/api/agents",
        {
          matricule,
          nom: "ZzTestCree",
          prenom: "Nouveau",
          sexe: "MASCULIN",
          fonction: "Testeur",
          dateRecrutement: "2024-01-01",
          typeContrat: "CDI",
          serviceId,
        },
        cookieSaisie,
      );
      expect(res.status).toBe(201);
      const agentCree = await json<{ id: string; matricule: string }>(res);
      idsAgentsCrees.push(agentCree.id);

      const mouvementInitial = await prisma.mouvement.findFirst({ where: { agentId: agentCree.id, type: "RECRUTEMENT" } });
      expect(mouvementInitial).not.toBeNull();

      const patch = await patcher(app, `/api/agents/${agentCree.id}`, { matricule: "AUTRE-MATRICULE", fonction: "Nouvelle fonction" }, cookieSaisie);
      expect(patch.status).toBe(200);
      const apres = await prisma.agent.findUniqueOrThrow({ where: { id: agentCree.id } });
      expect(apres.matricule).toBe(matricule); // inchangé
      expect(apres.fonction).toBe("Nouvelle fonction");

      const entreeJournal = await prisma.journal.findFirst({
        where: { action: "MODIFICATION_AGENT", cibleId: agentCree.id },
      });
      expect(entreeJournal).not.toBeNull();
      expect((entreeJournal?.detail as Record<string, { avant: unknown; apres: unknown }> | null)?.fonction).toEqual({
        avant: "Testeur",
        apres: "Nouvelle fonction",
      });
    });

    it("refuse un matricule en double avec 409", async () => {
      const agentExistant = await prisma.agent.findUniqueOrThrow({ where: { id: idsAgentsCrees[0]! } });
      const res = await poster(
        app,
        "/api/agents",
        {
          matricule: agentExistant.matricule,
          nom: "Doublon",
          prenom: "Test",
          sexe: "MASCULIN",
          fonction: "Testeur",
          dateRecrutement: "2024-01-01",
          typeContrat: "CDI",
          serviceId,
        },
        cookieSaisie,
      );
      expect(res.status).toBe(409);
    });
  });

  describe("droits par rôle", () => {
    it("LECTURE peut consulter la liste et la fiche", async () => {
      expect((await obtenir(app, "/api/agents", cookieLecture)).status).toBe(200);
      expect((await obtenir(app, `/api/agents/${idsAgentsCrees[0]}`, cookieLecture)).status).toBe(200);
    });

    it("LECTURE ne peut pas créer un agent (403)", async () => {
      const res = await poster(
        app,
        "/api/agents",
        {
          matricule: `INTERDIT-${suffixe}`,
          nom: "X",
          prenom: "Y",
          sexe: "MASCULIN",
          fonction: "Z",
          dateRecrutement: "2024-01-01",
          typeContrat: "CDI",
          serviceId,
        },
        cookieLecture,
      );
      expect(res.status).toBe(403);
    });

    it("LECTURE ne peut pas modifier un agent (403)", async () => {
      const res = await patcher(app, `/api/agents/${idsAgentsCrees[0]}`, { fonction: "Interdit" }, cookieLecture);
      expect(res.status).toBe(403);
    });

    it("SAISIE peut créer et modifier", async () => {
      const patch = await patcher(app, `/api/agents/${idsAgentsCrees[0]}`, { fonction: "Testeur" }, cookieSaisie);
      expect(patch.status).toBe(200);
    });

    it("sans session, tout est refusé (401)", async () => {
      expect((await obtenir(app, "/api/agents")).status).toBe(401);
      expect((await app.request("/api/agents", { method: "POST", headers: entetes() })).status).toBe(401);
    });
  });
});
