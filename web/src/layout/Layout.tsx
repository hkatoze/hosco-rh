import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, ArrowLeftRight, LayoutDashboard, LogOut, Settings, Users } from "lucide-react";
import { apiFetch } from "../api/client";
import type { Anomalie } from "../api/types";
import { useSession } from "../hooks/useSession";
import { Pastille } from "../components/Badge";
import { MOTIF_POINTS } from "../lib/motifs";

const LIENS = [
  { chemin: "/", libelle: "Tableau de bord", Icone: LayoutDashboard },
  { chemin: "/personnel", libelle: "Personnel", Icone: Users },
  { chemin: "/mouvements", libelle: "Mouvements", Icone: ArrowLeftRight },
  { chemin: "/anomalies", libelle: "Anomalies", Icone: AlertTriangle },
] as const;

const CLASSE_LIEN = ({ isActive }: { isActive: boolean }) =>
  `flex items-center gap-3 border-l-4 px-4 py-3 text-base transition-colors ${
    isActive
      ? "border-primaire bg-primaire/10 font-medium text-primaire"
      : "border-transparent text-texte-faible hover:border-bordure hover:bg-bordure/15 hover:text-texte-fort"
  }`;

export function Layout() {
  const { data: utilisateur } = useSession();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { data: anomalies } = useQuery({
    queryKey: ["anomalies", "compte"],
    queryFn: () => apiFetch<Anomalie[]>("/api/anomalies"),
    staleTime: 60_000,
  });

  const deconnexion = useMutation({
    mutationFn: () => apiFetch("/api/auth/deconnexion", { method: "POST" }),
    onSettled: () => {
      queryClient.clear();
      navigate("/connexion", { replace: true });
    },
  });

  return (
    <div className="flex h-screen flex-col overflow-hidden">
      <header className="flex h-barreSuperieure shrink-0 items-center gap-3 border-b border-primaire bg-primaire px-4 text-white">
        <img src="/logo.png" alt="" className="h-11 w-11 bg-white p-1" />
        <span className="flex items-baseline gap-2">
          <span className="text-xl font-medium">Axone</span>
          <span className="hidden text-sm text-white/70 sm:inline">- Logiciel modulaire de gestion RH</span>
        </span>

        <div className="ml-auto flex items-center gap-4">
          <span className="truncate text-sm" title={utilisateur?.nom}>
            {utilisateur?.nom}
          </span>
          <button
            type="button"
            onClick={() => deconnexion.mutate()}
            className="flex shrink-0 items-center gap-2 border border-white/60 px-3 py-1.5 text-sm hover:border-white hover:bg-white/10"
          >
            <LogOut className="h-4 w-4" aria-hidden="true" />
            Se déconnecter
          </button>
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        <nav
          className="flex w-barreLaterale shrink-0 flex-col justify-between overflow-y-auto border-r border-bordure bg-fond-carte shadow-carte"
          style={{ backgroundImage: MOTIF_POINTS, backgroundRepeat: "repeat" }}
        >
          <div className="flex flex-col p-4">
            <ul className="flex flex-col gap-1">
              {LIENS.map((lien) => (
                <li key={lien.chemin}>
                  <NavLink to={lien.chemin} end={lien.chemin === "/"} className={CLASSE_LIEN}>
                    <span className="flex flex-1 items-center gap-3">
                      <lien.Icone className="h-5 w-5" aria-hidden="true" />
                      {lien.libelle}
                    </span>
                    {lien.chemin === "/anomalies" && anomalies && anomalies.length > 0 && (
                      <Pastille>{anomalies.length}</Pastille>
                    )}
                  </NavLink>
                </li>
              ))}
            </ul>
          </div>

          <ul className="flex flex-col gap-1 border-t border-bordure p-4">
            <li>
              <NavLink to="/parametres" className={CLASSE_LIEN}>
                <Settings className="h-5 w-5" aria-hidden="true" />
                Paramètres
              </NavLink>
            </li>
          </ul>
        </nav>

        <main className="min-w-0 flex-1 overflow-y-auto p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
