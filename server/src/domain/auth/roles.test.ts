import type { RoleUtilisateur } from "@prisma/client";
import { describe, expect, it } from "vitest";
import { roleSuffisant } from "./roles";

const ROLES: RoleUtilisateur[] = ["LECTURE", "SAISIE", "ADMIN"];

// Matrice complète : ADMIN > SAISIE > LECTURE.
const ATTENDU: Record<RoleUtilisateur, Record<RoleUtilisateur, boolean>> = {
  LECTURE: { LECTURE: true, SAISIE: false, ADMIN: false },
  SAISIE: { LECTURE: true, SAISIE: true, ADMIN: false },
  ADMIN: { LECTURE: true, SAISIE: true, ADMIN: true },
};

describe("roleSuffisant", () => {
  for (const role of ROLES) {
    for (const roleRequis of ROLES) {
      it(`${role} contre l'exigence ${roleRequis} -> ${ATTENDU[role][roleRequis]}`, () => {
        expect(roleSuffisant(role, roleRequis)).toBe(ATTENDU[role][roleRequis]);
      });
    }
  }
});
