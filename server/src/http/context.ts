import type { RoleUtilisateur } from "@prisma/client";

export interface UtilisateurConnecte {
  id: string;
  identifiant: string;
  nom: string;
  role: RoleUtilisateur;
  actif: boolean;
  doitChangerMotDePasse: boolean;
}

export interface VariablesHono {
  utilisateur: UtilisateurConnecte;
  sessionId: string;
}
