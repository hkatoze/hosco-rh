import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch, ErreurApi } from "../../api/client";
import { Champ } from "../../components/Champ";
import { Bouton } from "../../components/Bouton";

export function MotDePasseSection() {
  const [ancien, setAncien] = useState("");
  const [nouveau, setNouveau] = useState("");
  const [reussi, setReussi] = useState(false);
  const queryClient = useQueryClient();

  const changer = useMutation({
    mutationFn: () => apiFetch("/api/auth/mot-de-passe", { method: "POST", body: JSON.stringify({ ancien, nouveau }) }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["session"] });
      setAncien("");
      setNouveau("");
      setReussi(true);
    },
  });

  return (
    <div className="max-w-sm border border-bordure bg-fond-carte p-6 shadow-carte">
      <h2 className="mb-1 text-base font-medium text-texte-fort">Changer mon mot de passe</h2>
      <p className="mb-6 text-sm text-texte-faible">Les autres sessions ouvertes avec ce compte seront déconnectées.</p>

      <form
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          setReussi(false);
          changer.mutate();
        }}
      >
        <Champ
          id="parametres-ancien"
          etiquette="Mot de passe actuel"
          type="password"
          autoComplete="current-password"
          value={ancien}
          onChange={(e) => setAncien(e.target.value)}
          required
        />
        <Champ
          id="parametres-nouveau"
          etiquette="Nouveau mot de passe (8 caractères minimum)"
          type="password"
          autoComplete="new-password"
          minLength={8}
          value={nouveau}
          onChange={(e) => setNouveau(e.target.value)}
          required
        />

        {reussi && (
          <p role="status" className="border border-statut-vert bg-statut-vert/10 px-3 py-2 text-sm text-statut-vert">
            Mot de passe changé avec succès.
          </p>
        )}
        {changer.isError && (
          <p role="alert" className="text-sm text-primaire">
            {changer.error instanceof ErreurApi ? changer.error.message : "Serveur injoignable. Réessayez plus tard."}
          </p>
        )}

        <Bouton type="submit" variante="primaire" disabled={changer.isPending} className="mt-2">
          {changer.isPending ? "Enregistrement…" : "Changer le mot de passe"}
        </Bouton>
      </form>
    </div>
  );
}
