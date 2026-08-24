import type { ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { useSession } from "../hooks/useSession";
import { roleSuffisant } from "../lib/roles";
import type { RoleUtilisateur } from "../api/types";

interface RouteProtegeeProps {
  children: ReactNode;
  roleMinimum?: RoleUtilisateur;
}

/**
 * Garde côté client : masque/redirige pour le confort d'usage. Le serveur
 * reste seul juge — chaque route API revalide le rôle indépendamment.
 */
export function RouteProtegee({ children, roleMinimum }: RouteProtegeeProps) {
  const { data: utilisateur, isLoading, isError } = useSession();

  if (isLoading) return null;
  if (isError || !utilisateur) return <Navigate to="/connexion" replace />;
  if (utilisateur.doitChangerMotDePasse) return <Navigate to="/changer-mot-de-passe" replace />;
  if (roleMinimum && !roleSuffisant(utilisateur.role, roleMinimum)) return <Navigate to="/" replace />;

  return <>{children}</>;
}
