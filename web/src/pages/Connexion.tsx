import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch, ErreurApi } from "../api/client";
import type { UtilisateurConnecte } from "../api/types";
import { Champ } from "../components/Champ";
import { Bouton } from "../components/Bouton";
import { CitationRotative } from "./CitationRotative";

// Motif de points décoratif (image SVG, pas un dégradé CSS). Très discret
// sur fond sombre, aplat de couleur uniquement — voir CLAUDE.md.
const MOTIF_POINTS =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='24' height='24'%3E%3Ccircle cx='2' cy='2' r='1.4' fill='%23F7F3EC' fill-opacity='0.08'/%3E%3C/svg%3E\")";

export function Connexion() {
  const [identifiant, setIdentifiant] = useState("");
  const [motDePasse, setMotDePasse] = useState("");
  const refIdentifiant = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  useEffect(() => {
    refIdentifiant.current?.focus();
  }, []);

  const connexion = useMutation({
    mutationFn: () =>
      apiFetch<UtilisateurConnecte>("/api/auth/connexion", {
        method: "POST",
        body: JSON.stringify({ identifiant, motDePasse }),
      }),
    onSuccess: (utilisateur) => {
      queryClient.setQueryData(["session"], utilisateur);
      navigate(utilisateur.doitChangerMotDePasse ? "/changer-mot-de-passe" : "/", { replace: true });
    },
  });

  return (
    <div
      className="relative flex min-h-screen items-center justify-center overflow-hidden bg-fond-page px-4 py-10"
      style={{ backgroundImage: MOTIF_POINTS, backgroundRepeat: "repeat" }}
    >
      {/* Motifs décoratifs : aplats de bordure seulement, ni ombre ni dégradé. */}
      <div className="pointer-events-none absolute -left-16 -top-16 h-64 w-64 border border-bordure/60" aria-hidden="true" />
      <div className="pointer-events-none absolute -bottom-24 -right-24 h-80 w-80 border border-primaire/20" aria-hidden="true" />

      <div className="relative flex w-full max-w-4xl items-stretch justify-center gap-12">
        {/* Colonne de marque : visible à partir de md, purement décorative. */}
        <div className="hidden flex-1 flex-col justify-center gap-8 py-8 md:flex">
          <div>
            <img src="/logo.png" alt="" className="mb-6 h-16 w-16" />
            <p className="text-4xl font-medium leading-tight text-texte-fort">ZAKA RH</p>
            <p className="mt-2 max-w-xs text-base text-texte-faible">
              Gestion du personnel de l'Hôpital Saint Camille
            </p>
          </div>
          <div className="max-w-xs border-l-2 border-primaire pl-4">
            <CitationRotative />
          </div>
        </div>

        {/* Carte de connexion : élevée par une vraie ombre. */}
        <form
          className="w-full max-w-sm shrink-0 self-center border border-bordure bg-fond-carte p-8 shadow-connexion"
          onSubmit={(e) => {
            e.preventDefault();
            connexion.mutate();
          }}
        >
          <div className="mb-8 flex flex-col items-center text-center md:hidden">
            <img src="/logo.png" alt="" className="mb-4 h-14 w-14" />
            <p className="text-xl font-medium text-texte-fort">ZAKA RH</p>
          </div>
          <div className="mb-6 hidden md:block">
            <div className="mb-3 h-1 w-10 bg-primaire" aria-hidden="true" />
            <h1 className="text-xl font-medium text-texte-fort">Connexion</h1>
          </div>

          <div className="flex flex-col gap-4">
            <Champ
              ref={refIdentifiant}
              id="identifiant"
              etiquette="Identifiant"
              autoComplete="username"
              value={identifiant}
              onChange={(e) => setIdentifiant(e.target.value)}
              required
            />
            <Champ
              id="mot-de-passe"
              etiquette="Mot de passe"
              type="password"
              autoComplete="current-password"
              value={motDePasse}
              onChange={(e) => setMotDePasse(e.target.value)}
              required
            />

            {connexion.isError && (
              <p role="alert" className="border border-primaire bg-primaire/10 px-3 py-2 text-sm text-primaire">
                {connexion.error instanceof ErreurApi
                  ? connexion.error.message
                  : "Serveur injoignable. Réessayez plus tard."}
              </p>
            )}

            <Bouton type="submit" variante="primaire" disabled={connexion.isPending} className="mt-2 w-full">
              {connexion.isPending ? "Connexion…" : "Se connecter"}
            </Bouton>

            <p className="mt-2 text-center text-xs text-texte-faible md:text-left">Service des ressources humaines</p>
          </div>
        </form>
      </div>
    </div>
  );
}
