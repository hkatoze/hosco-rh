import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { apiFetch, ErreurApi } from "../../api/client";
import { schemaAnnulationMouvement } from "../../../../shared/mouvement";
import { Modale } from "../Modale";
import { Champ } from "../Champ";
import { Bouton } from "../Bouton";

type ValeursFormulaire = z.infer<typeof schemaAnnulationMouvement>;

interface AnnulerMouvementModaleProps {
  mouvementId: string;
  agentId: string;
  ouverte: boolean;
  onFermer: () => void;
}

export function AnnulerMouvementModale({ mouvementId, agentId, ouverte, onFermer }: AnnulerMouvementModaleProps) {
  const queryClient = useQueryClient();
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<ValeursFormulaire>({ resolver: zodResolver(schemaAnnulationMouvement), defaultValues: { motif: "" } });

  const annulation = useMutation({
    mutationFn: (valeurs: ValeursFormulaire) => apiFetch(`/api/mouvements/${mouvementId}/annuler`, { method: "POST", body: JSON.stringify(valeurs) }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["agent", agentId] });
      reset();
      onFermer();
    },
  });

  return (
    <Modale ouverte={ouverte} titre="Annuler ce mouvement" onFermer={onFermer}>
      <form
        className="flex flex-col gap-4"
        onSubmit={handleSubmit((v) => {
          annulation.mutate(v);
        })}
      >
        <p className="text-sm text-texte-faible">
          Ce mouvement sera ignoré par le calcul du statut de l'agent. Cette action est tracée et irréversible.
        </p>
        <Champ id="motif-annulation" etiquette="Motif de l'annulation" required erreur={errors.motif?.message} {...register("motif")} />

        {annulation.isError && (
          <p role="alert" className="border border-primaire bg-primaire/10 px-3 py-2 text-sm text-primaire">
            {annulation.error instanceof ErreurApi ? annulation.error.message : "Serveur injoignable. Réessayez plus tard."}
          </p>
        )}

        <div className="mt-2 flex justify-end gap-3">
          <Bouton type="button" variante="discret" onClick={onFermer}>
            fermer
          </Bouton>
          <Bouton type="submit" variante="primaire" disabled={annulation.isPending}>
            {annulation.isPending ? "annulation…" : "confirmer l'annulation"}
          </Bouton>
        </div>
      </form>
    </Modale>
  );
}
