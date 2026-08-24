import { useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch, ErreurApi } from "../api/client";
import { useSession } from "../hooks/useSession";
import { Champ } from "../components/Champ";
import { Bouton } from "../components/Bouton";

export function ChangerMotDePasse() {
  const { data: utilisateur, isLoading, isError } = useSession();
  const [ancien, setAncien] = useState("");
  const [nouveau, setNouveau] = useState("");
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const changer = useMutation({
    mutationFn: () => apiFetch("/api/auth/mot-de-passe", { method: "POST", body: JSON.stringify({ ancien, nouveau }) }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["session"] });
      navigate("/", { replace: true });
    },
  });

  if (isLoading) return null;
  if (isError || !utilisateur) return <Navigate to="/connexion" replace />;

  return (
    <div className="flex min-h-screen items-center justify-center bg-fond-page px-4">
      <form
        className="w-full max-w-sm border border-bordure bg-fond-carte p-8 shadow-connexion"
        onSubmit={(e) => {
          e.preventDefault();
          changer.mutate();
        }}
      >
        <div className="mb-6">
          <p className="text-lg font-medium text-primaire">Changement de mot de passe requis</p>
          <p className="text-sm text-texte-faible">
            Votre mot de passe doit être changé avant de continuer à utiliser l'application.
          </p>
        </div>

        <div className="flex flex-col gap-4">
          <Champ
            id="ancien"
            etiquette="Ancien mot de passe"
            type="password"
            autoComplete="current-password"
            value={ancien}
            onChange={(e) => setAncien(e.target.value)}
            autoFocus
            required
          />
          <Champ
            id="nouveau"
            etiquette="Nouveau mot de passe (8 caractères minimum)"
            type="password"
            autoComplete="new-password"
            minLength={8}
            value={nouveau}
            onChange={(e) => setNouveau(e.target.value)}
            required
          />

          {changer.isError && (
            <p role="alert" className="text-sm text-primaire">
              {changer.error instanceof ErreurApi ? changer.error.message : "Serveur injoignable. Réessayez plus tard."}
            </p>
          )}

          <Bouton type="submit" variante="primaire" disabled={changer.isPending} className="mt-2">
            {changer.isPending ? "Enregistrement…" : "Changer le mot de passe"}
          </Bouton>
        </div>
      </form>
    </div>
  );
}
