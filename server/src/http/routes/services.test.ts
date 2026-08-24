import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { RoleUtilisateur } from "@prisma/client";
import { prisma } from "../../db";
import { creerApp } from "../app";
import { connexionTest, creerUtilisateurTest, obtenir } from "../testUtils";

const app = creerApp();

describe("GET /api/services", () => {
  const suffixe = randomUUID().slice(0, 8);
  const identifiants: Record<RoleUtilisateur, string> = {
    LECTURE: `test.services.lecture.${suffixe}`,
    SAISIE: `test.services.saisie.${suffixe}`,
    ADMIN: `test.services.admin.${suffixe}`,
  };
  const ids: string[] = [];

  beforeAll(async () => {
    for (const [role, identifiant] of Object.entries(identifiants) as [RoleUtilisateur, string][]) {
      const u = await creerUtilisateurTest(identifiant, role);
      ids.push(u.id);
    }
  });

  afterAll(async () => {
    await prisma.journal.deleteMany({ where: { utilisateurId: { in: ids } } });
    await prisma.utilisateur.deleteMany({ where: { id: { in: ids } } });
  });

  it("renvoie les services actifs avec le nombre d'agents présents", async () => {
    const cookie = await connexionTest(app, identifiants.LECTURE);
    const res = await obtenir(app, "/api/services", cookie);
    expect(res.status).toBe(200);
    const corps = (await res.json()) as Array<{ id: string; nom: string; actif: boolean; agentsPresents: number }>;
    expect(corps.length).toBeGreaterThan(0);
    for (const s of corps) {
      expect(s.actif).toBe(true);
      expect(typeof s.agentsPresents).toBe("number");
    }
  });

  it("nécessite une session valide", async () => {
    const res = await obtenir(app, "/api/services");
    expect(res.status).toBe(401);
  });
});
