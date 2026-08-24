import type { RoleUtilisateur } from "@prisma/client";
import { Hono } from "hono";
import { describe, expect, it } from "vitest";
import { exigeRole } from "./auth";
import type { UtilisateurConnecte, VariablesHono } from "../context";

const ROLES: RoleUtilisateur[] = ["LECTURE", "SAISIE", "ADMIN"];

function creerAppTest(roleUtilisateur: RoleUtilisateur, roleRequis: RoleUtilisateur) {
  const app = new Hono<{ Variables: VariablesHono }>();
  app.use("*", async (c, next) => {
    const utilisateur: UtilisateurConnecte = {
      id: "u1",
      identifiant: "test",
      nom: "Test",
      role: roleUtilisateur,
      actif: true,
      doitChangerMotDePasse: false,
    };
    c.set("utilisateur", utilisateur);
    await next();
  });
  app.get("/protege", exigeRole(roleRequis), (c) => c.json({ ok: true }));
  return app;
}

const ATTENDU: Record<RoleUtilisateur, Record<RoleUtilisateur, number>> = {
  LECTURE: { LECTURE: 200, SAISIE: 403, ADMIN: 403 },
  SAISIE: { LECTURE: 200, SAISIE: 200, ADMIN: 403 },
  ADMIN: { LECTURE: 200, SAISIE: 200, ADMIN: 200 },
};

describe("exigeRole (middleware Hono)", () => {
  for (const roleUtilisateur of ROLES) {
    for (const roleRequis of ROLES) {
      it(`rôle ${roleUtilisateur} sur une route exigeant ${roleRequis} -> ${ATTENDU[roleUtilisateur][roleRequis]}`, async () => {
        const app = creerAppTest(roleUtilisateur, roleRequis);
        const res = await app.request("/protege");
        expect(res.status).toBe(ATTENDU[roleUtilisateur][roleRequis]);
      });
    }
  }
});
