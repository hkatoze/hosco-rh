import { randomUUID } from "node:crypto";
import type { RoleUtilisateur } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "../../db";
import { creerApp } from "../app";
import { connexionTest, creerUtilisateurTest, entetes, patcher, poster } from "../testUtils";

const app = creerApp();
const suffixe = randomUUID().slice(0, 8);

describe("Gestion des utilisateurs (Paramètres)", () => {
  const identifiants: Record<RoleUtilisateur, string> = {
    LECTURE: `test.usradm.lecture.${suffixe}`,
    SAISIE: `test.usradm.saisie.${suffixe}`,
    ADMIN: `test.usradm.admin.${suffixe}`,
  };
  const idsUtilisateurs: string[] = [];
  const idsCrees: string[] = [];
  let cookieAdmin: string;
  let cookieSaisie: string;
  let idAdmin: string;

  beforeAll(async () => {
    for (const [role, identifiant] of Object.entries(identifiants) as [RoleUtilisateur, string][]) {
      const u = await creerUtilisateurTest(identifiant, role);
      idsUtilisateurs.push(u.id);
      if (role === "ADMIN") idAdmin = u.id;
    }
    cookieAdmin = await connexionTest(app, identifiants.ADMIN);
    cookieSaisie = await connexionTest(app, identifiants.SAISIE);
  });

  afterAll(async () => {
    await prisma.journal.deleteMany({ where: { cibleType: "Utilisateur", cibleId: { in: idsCrees } } });
    await prisma.utilisateur.deleteMany({ where: { id: { in: idsCrees } } });
    await prisma.session.deleteMany({ where: { utilisateurId: { in: idsUtilisateurs } } });
    await prisma.journal.deleteMany({ where: { utilisateurId: { in: idsUtilisateurs } } });
    await prisma.utilisateur.deleteMany({ where: { id: { in: idsUtilisateurs } } });
  });

  it("SAISIE ne peut pas lister les utilisateurs (403)", async () => {
    const res = await app.request("/api/utilisateurs", { headers: entetes(cookieSaisie) });
    expect(res.status).toBe(403);
  });

  it("ADMIN crée un utilisateur, reçoit un mot de passe temporaire, doitChangerMotDePasse=true", async () => {
    const res = await poster(
      app,
      "/api/utilisateurs",
      { identifiant: `zz.nouveau.${suffixe}`, nom: "Zz Nouveau", role: "SAISIE" },
      cookieAdmin,
    );
    expect(res.status).toBe(201);
    const corps = (await res.json()) as { id: string; motDePasseTemporaire: string; doitChangerMotDePasse: boolean };
    idsCrees.push(corps.id);
    expect(corps.motDePasseTemporaire).toHaveLength(12);
    expect(corps.doitChangerMotDePasse).toBe(true);

    const enBase = await prisma.utilisateur.findUnique({ where: { id: corps.id } });
    expect(enBase?.motDePasseHash).not.toContain(corps.motDePasseTemporaire);

    const entree = await prisma.journal.findFirst({ where: { action: "CREATION_UTILISATEUR", cibleId: corps.id } });
    expect(entree).not.toBeNull();
  });

  it("refuse un identifiant déjà utilisé (409)", async () => {
    const res = await poster(app, "/api/utilisateurs", { identifiant: identifiants.ADMIN, nom: "X", role: "LECTURE" }, cookieAdmin);
    expect(res.status).toBe(409);
  });

  it("GET /api/utilisateurs ne renvoie jamais le hash du mot de passe", async () => {
    const res = await app.request("/api/utilisateurs", { headers: entetes(cookieAdmin) });
    const corps = (await res.json()) as Array<Record<string, unknown>>;
    expect(corps.length).toBeGreaterThan(0);
    for (const u of corps) expect(u).not.toHaveProperty("motDePasseHash");
  });

  it("ADMIN modifie le rôle d'un utilisateur, journalise MODIFICATION_UTILISATEUR", async () => {
    const id = idsCrees[0]!;
    const res = await patcher(app, `/api/utilisateurs/${id}`, { role: "ADMIN" }, cookieAdmin);
    expect(res.status).toBe(200);
    const enBase = await prisma.utilisateur.findUnique({ where: { id } });
    expect(enBase?.role).toBe("ADMIN");
  });

  it("un ADMIN ne peut pas se désactiver lui-même (422)", async () => {
    const res = await patcher(app, `/api/utilisateurs/${idAdmin}`, { actif: false }, cookieAdmin);
    expect(res.status).toBe(422);
  });
});
