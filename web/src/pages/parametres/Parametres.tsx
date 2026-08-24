import { NavLink, Outlet } from "react-router-dom";
import { Trash2, KeyRound, Users, Building2 } from "lucide-react";
import { useSession } from "../../hooks/useSession";
import { roleSuffisant } from "../../lib/roles";

const ONGLETS = [
  { chemin: "/parametres/mot-de-passe", libelle: "Mot de passe", Icone: KeyRound, roleMinimum: "LECTURE" as const },
  { chemin: "/parametres/services", libelle: "Services", Icone: Building2, roleMinimum: "ADMIN" as const },
  { chemin: "/parametres/utilisateurs", libelle: "Utilisateurs", Icone: Users, roleMinimum: "ADMIN" as const },
  { chemin: "/parametres/corbeille", libelle: "Corbeille", Icone: Trash2, roleMinimum: "ADMIN" as const },
];

export function Parametres() {
  const { data: utilisateur } = useSession();
  const onglets = ONGLETS.filter((o) => utilisateur && roleSuffisant(utilisateur.role, o.roleMinimum));

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-lg font-medium text-texte-fort">Paramètres</h1>

      <div className="flex flex-col gap-6 md:flex-row">
        <nav className="flex shrink-0 flex-row gap-2 overflow-x-auto md:w-56 md:flex-col">
          {onglets.map((onglet) => (
            <NavLink
              key={onglet.chemin}
              to={onglet.chemin}
              className={({ isActive }) =>
                `flex shrink-0 items-center gap-3 border px-4 py-3 text-sm ${
                  isActive ? "border-primaire font-medium text-primaire" : "border-transparent text-texte-fort hover:border-bordure"
                }`
              }
            >
              <onglet.Icone className="h-4 w-4" aria-hidden="true" />
              {onglet.libelle}
            </NavLink>
          ))}
        </nav>

        <div className="min-w-0 flex-1">
          <Outlet />
        </div>
      </div>
    </div>
  );
}
