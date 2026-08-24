import { randomUUID } from "node:crypto";
import ExcelJS from "exceljs";
import type { RoleUtilisateur } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "../../db";
import { creerApp } from "../app";
import { connexionTest, creerUtilisateurTest } from "../testUtils";

const app = creerApp();
const suffixe = randomUUID().slice(0, 8);

async function chargerClasseur(res: Response): Promise<ExcelJS.Workbook> {
  const tampon = Buffer.from(new Uint8Array(await res.arrayBuffer()));
  const classeur = new ExcelJS.Workbook();
  // @ts-expect-error -- décalage de définition de types entre le Buffer<T>
  // paramétré de @types/node récent et le Buffer non paramétré attendu par
  // les .d.ts (non mis à jour) d'exceljs ; identique à l'exécution.
  await classeur.xlsx.load(tampon);
  return classeur;
}

describe("GET /api/tableau-de-bord/rapport", () => {
  const identifiants: Record<RoleUtilisateur, string> = {
    LECTURE: `test.rapport.lecture.${suffixe}`,
    SAISIE: `test.rapport.saisie.${suffixe}`,
    ADMIN: `test.rapport.admin.${suffixe}`,
  };
  const idsUtilisateurs: string[] = [];
  let cookieLecture: string;

  beforeAll(async () => {
    for (const [role, identifiant] of Object.entries(identifiants) as [RoleUtilisateur, string][]) {
      const u = await creerUtilisateurTest(identifiant, role);
      idsUtilisateurs.push(u.id);
    }
    cookieLecture = await connexionTest(app, identifiants.LECTURE);
  });

  afterAll(async () => {
    await prisma.session.deleteMany({ where: { utilisateurId: { in: idsUtilisateurs } } });
    await prisma.journal.deleteMany({ where: { utilisateurId: { in: idsUtilisateurs } } });
    await prisma.utilisateur.deleteMany({ where: { id: { in: idsUtilisateurs } } });
  });

  it("génère un .xlsx à trois feuilles cohérent avec les indicateurs de l'écran", async () => {
    const resEcran = await app.request("/api/tableau-de-bord", { headers: { Cookie: cookieLecture } });
    const stats = (await resEcran.json()) as { totalPersonnel: number };

    const resRapport = await app.request("/api/tableau-de-bord/rapport", { headers: { Cookie: cookieLecture } });
    expect(resRapport.status).toBe(200);
    expect(resRapport.headers.get("content-type")).toBe("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    expect(resRapport.headers.get("content-disposition")).toMatch(/attachment; filename="rapport-rh-\d{4}-\d{2}-\d{2}\.xlsx"/);

    const classeur = await chargerClasseur(resRapport);
    expect(classeur.getWorksheet("Résumé")).toBeDefined();
    expect(classeur.getWorksheet("Répartition par service")).toBeDefined();

    const resume = classeur.getWorksheet("Résumé")!;
    const lignePersonnelActif = resume.getRows(1, resume.rowCount)?.find((l) => l.getCell(1).value === "Personnel actif");
    expect(lignePersonnelActif?.getCell(2).value).toBe(stats.totalPersonnel);
  });

  it("journalise EXPORT_RAPPORT_TABLEAU_DE_BORD", async () => {
    await app.request("/api/tableau-de-bord/rapport", { headers: { Cookie: cookieLecture } });
    const utilisateur = await prisma.utilisateur.findUniqueOrThrow({ where: { identifiant: identifiants.LECTURE } });
    const entree = await prisma.journal.findFirst({
      where: { action: "EXPORT_RAPPORT_TABLEAU_DE_BORD", utilisateurId: utilisateur.id },
      orderBy: { createdAt: "desc" },
    });
    expect(entree).not.toBeNull();
  });

  it("nécessite une session valide (401)", async () => {
    const res = await app.request("/api/tableau-de-bord/rapport");
    expect(res.status).toBe(401);
  });
});
