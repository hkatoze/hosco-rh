import { randomUUID } from "node:crypto";
import ExcelJS from "exceljs";
import type { RoleUtilisateur } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "../../db";
import { creerApp } from "../app";
import { connexionTest, creerUtilisateurTest } from "../testUtils";

const app = creerApp();
const suffixe = randomUUID().slice(0, 8);

/**
 * @types/node récent paramètre Buffer<TArrayBuffer> ; les types d'exceljs
 * (non mis à jour) attendent encore le Buffer non paramétré — d'où ce
 * contournement local, isolé ici plutôt que dupliqué à chaque appel.
 */
async function chargerClasseur(res: Response): Promise<ExcelJS.Workbook> {
  const tampon = Buffer.from(new Uint8Array(await res.arrayBuffer()));
  const classeur = new ExcelJS.Workbook();
  // @ts-expect-error -- décalage de définition de types entre le Buffer<T>
  // paramétré de @types/node récent et le Buffer non paramétré attendu par
  // les .d.ts (non mis à jour) d'exceljs ; identique à l'exécution.
  await classeur.xlsx.load(tampon);
  return classeur;
}

describe("GET /api/agents/export", () => {
  const identifiants: Record<RoleUtilisateur, string> = {
    LECTURE: `test.export.lecture.${suffixe}`,
    SAISIE: `test.export.saisie.${suffixe}`,
    ADMIN: `test.export.admin.${suffixe}`,
  };
  const idsUtilisateurs: string[] = [];
  const idsAgents: string[] = [];
  let serviceId: string;
  let cookieLecture: string;
  const matriculeCDI = `ZZEXP-CDI-${suffixe}`;
  const matriculeCDD = `ZZEXP-CDD-${suffixe}`;

  beforeAll(async () => {
    for (const [role, identifiant] of Object.entries(identifiants) as [RoleUtilisateur, string][]) {
      const u = await creerUtilisateurTest(identifiant, role);
      idsUtilisateurs.push(u.id);
    }
    const service = await prisma.service.findFirstOrThrow({ where: { actif: true } });
    serviceId = service.id;
    cookieLecture = await connexionTest(app, identifiants.LECTURE);

    const agentCDI = await prisma.agent.create({
      data: {
        matricule: matriculeCDI,
        nom: "ZzTestExport",
        prenom: "Cdi",
        sexe: "MASCULIN",
        fonction: "Testeur",
        dateRecrutement: new Date("2020-01-01"),
        typeContrat: "CDI",
        serviceId,
      },
    });
    idsAgents.push(agentCDI.id);
    await prisma.mouvement.create({
      data: { agentId: agentCDI.id, type: "RECRUTEMENT", dateEffet: new Date("2020-01-01"), saisiParId: idsUtilisateurs[0]! },
    });

    const agentCDD = await prisma.agent.create({
      data: {
        matricule: matriculeCDD,
        nom: "ZzTestExport",
        prenom: "Cdd",
        sexe: "FEMININ",
        fonction: "Testeuse",
        dateRecrutement: new Date("2021-01-01"),
        typeContrat: "CDD",
        serviceId,
      },
    });
    idsAgents.push(agentCDD.id);
    await prisma.mouvement.create({
      data: { agentId: agentCDD.id, type: "RECRUTEMENT", dateEffet: new Date("2021-01-01"), saisiParId: idsUtilisateurs[0]! },
    });
  });

  afterAll(async () => {
    await prisma.journal.deleteMany({ where: { OR: [{ cibleType: "Agent", cibleId: { in: idsAgents } }, { action: "EXPORT_PERSONNEL", utilisateurId: { in: idsUtilisateurs } }] } });
    await prisma.mouvement.deleteMany({ where: { agentId: { in: idsAgents } } });
    await prisma.agent.deleteMany({ where: { id: { in: idsAgents } } });
    await prisma.session.deleteMany({ where: { utilisateurId: { in: idsUtilisateurs } } });
    await prisma.journal.deleteMany({ where: { utilisateurId: { in: idsUtilisateurs } } });
    await prisma.utilisateur.deleteMany({ where: { id: { in: idsUtilisateurs } } });
  });

  it("génère un .xlsx valide contenant les agents correspondant à la recherche", async () => {
    const res = await app.request(`/api/agents/export?q=ZzTestExport`, { headers: { Cookie: cookieLecture } });
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    expect(res.headers.get("content-disposition")).toMatch(/attachment; filename="annuaire-personnel-\d{4}-\d{2}-\d{2}\.xlsx"/);

    const classeur = await chargerClasseur(res);
    const feuille = classeur.getWorksheet("Personnel")!;
    expect(feuille).toBeDefined();

    const entetes = feuille.getRow(1).values as unknown[];
    expect(entetes).toContain("Matricule");
    expect(entetes).toContain("Statut");

    const matricules = new Set<string>();
    feuille.eachRow((ligne, numero) => {
      if (numero === 1) return;
      matricules.add(String(ligne.getCell(1).value));
    });
    expect(matricules.has(matriculeCDI)).toBe(true);
    expect(matricules.has(matriculeCDD)).toBe(true);
  });

  it("respecte le filtre typeContrat", async () => {
    const res = await app.request(`/api/agents/export?q=ZzTestExport&typeContrat=CDI`, { headers: { Cookie: cookieLecture } });
    const classeur = await chargerClasseur(res);
    const feuille = classeur.getWorksheet("Personnel")!;

    const matricules = new Set<string>();
    feuille.eachRow((ligne, numero) => {
      if (numero === 1) return;
      matricules.add(String(ligne.getCell(1).value));
    });
    expect(matricules.has(matriculeCDI)).toBe(true);
    expect(matricules.has(matriculeCDD)).toBe(false);
  });

  it("journalise EXPORT_PERSONNEL avec les filtres utilisés", async () => {
    await app.request(`/api/agents/export?q=ZzTestExport&typeContrat=CDD`, { headers: { Cookie: cookieLecture } });
    const utilisateurLecture = await prisma.utilisateur.findUniqueOrThrow({ where: { identifiant: identifiants.LECTURE } });
    const entree = await prisma.journal.findFirst({
      where: { action: "EXPORT_PERSONNEL", utilisateurId: utilisateurLecture.id },
      orderBy: { createdAt: "desc" },
    });
    expect(entree).not.toBeNull();
    expect((entree?.detail as { typeContrat?: string })?.typeContrat).toBe("CDD");
  });

  it("nécessite une session valide (401)", async () => {
    const res = await app.request("/api/agents/export");
    expect(res.status).toBe(401);
  });
});
