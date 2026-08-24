import type { RoleUtilisateur } from "../api/types";

const NIVEAU: Record<RoleUtilisateur, number> = {
  LECTURE: 1,
  SAISIE: 2,
  ADMIN: 3,
};

/**
 * Miroir de server/src/domain/auth/roles.ts — uniquement pour masquer des
 * éléments d'interface. Le serveur reste seul juge : il revalide toujours
 * le rôle sur chaque requête.
 */
export function roleSuffisant(role: RoleUtilisateur, roleRequis: RoleUtilisateur): boolean {
  return NIVEAU[role] >= NIVEAU[roleRequis];
}
