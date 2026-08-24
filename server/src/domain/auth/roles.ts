import type { RoleUtilisateur } from "@prisma/client";

const NIVEAU: Record<RoleUtilisateur, number> = {
  LECTURE: 1,
  SAISIE: 2,
  ADMIN: 3,
};

/** ADMIN > SAISIE > LECTURE : un rôle est suffisant s'il est au moins aussi élevé que le rôle requis. */
export function roleSuffisant(role: RoleUtilisateur, roleRequis: RoleUtilisateur): boolean {
  return NIVEAU[role] >= NIVEAU[roleRequis];
}
