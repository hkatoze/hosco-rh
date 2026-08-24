import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { apiFetch, ErreurApi } from "../../api/client";
import type { DocumentAgent, Mouvement, StatutAgent } from "../../api/types";
import { TYPES_MOUVEMENT_SAISISSABLES } from "../../../../shared/mouvement";
import { LIBELLE_TYPE_MOUVEMENT } from "../../lib/mouvement";
import { Modale } from "../Modale";
import { Champ } from "../Champ";
import { Selecteur } from "../Selecteur";
import { Bouton } from "../Bouton";

type TypeMouvementSaisissable = (typeof TYPES_MOUVEMENT_SAISISSABLES)[number];
const TYPES_DEFINITIFS: readonly TypeMouvementSaisissable[] = ["DEMISSION", "LICENCIEMENT", "RETRAITE", "DECES"];

const schemaFormulaire = z.object({
  type: z.enum(TYPES_MOUVEMENT_SAISISSABLES),
  dateEffet: z.string().min(1, "La date d'effet est requise."),
  dateFin: z.string().optional(),
  motif: z.string().optional(),
  documentId: z.string().optional(),
});
type ValeursFormulaire = z.infer<typeof schemaFormulaire>;

interface MouvementModalProps {
  agentId: string;
  ouverte: boolean;
  onFermer: () => void;
  statutActuel: StatutAgent;
  documentsDisponibles: DocumentAgent[];
  valeursInitiales?: { type?: TypeMouvementSaisissable; dateEffet?: string };
}

function joursEntre(debut: string, fin: string): number | null {
  if (!debut || !fin) return null;
  const ms = new Date(fin).getTime() - new Date(debut).getTime();
  if (Number.isNaN(ms) || ms < 0) return null;
  return Math.round(ms / (24 * 60 * 60 * 1000)) + 1;
}

export function MouvementModal({ agentId, ouverte, onFermer, statutActuel, documentsDisponibles, valeursInitiales }: MouvementModalProps) {
  const queryClient = useQueryClient();
  const {
    register,
    handleSubmit,
    watch,
    reset,
    setError,
    formState: { errors, isDirty },
  } = useForm<ValeursFormulaire>({
    resolver: zodResolver(schemaFormulaire),
    defaultValues: { type: valeursInitiales?.type ?? "CONGE", dateEffet: valeursInitiales?.dateEffet ?? "", dateFin: "", motif: "", documentId: "" },
  });

  useEffect(() => {
    if (ouverte) {
      reset({ type: valeursInitiales?.type ?? "CONGE", dateEffet: valeursInitiales?.dateEffet ?? "", dateFin: "", motif: "", documentId: "" });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ouverte]);

  const type = watch("type");
  const dateEffet = watch("dateEffet");
  const dateFin = watch("dateFin");
  const estDefinitif = TYPES_DEFINITIFS.includes(type);
  const duree = type === "CONGE" && dateFin ? joursEntre(dateEffet, dateFin) : null;

  const typesProposes = TYPES_MOUVEMENT_SAISISSABLES.filter((t) => t !== "FIN_SUSPENSION" || statutActuel === "SUSPENDU");

  const creation = useMutation({
    mutationFn: (valeurs: ValeursFormulaire) =>
      apiFetch<{ mouvement: Mouvement; statut: StatutAgent }>(`/api/agents/${agentId}/mouvements`, {
        method: "POST",
        body: JSON.stringify({
          type: valeurs.type,
          dateEffet: valeurs.dateEffet,
          dateFin: valeurs.dateFin || null,
          motif: valeurs.motif || null,
          documentId: valeurs.documentId || null,
        }),
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["agent", agentId] });
      onFermer();
    },
    onError: (erreur) => {
      if (erreur instanceof ErreurApi && erreur.champ && erreur.champ in schemaFormulaire.shape) {
        setError(erreur.champ as keyof ValeursFormulaire, { message: erreur.message });
      }
    },
  });

  function surSoumission(valeurs: ValeursFormulaire) {
    if (estDefinitif) {
      const confirme = window.confirm("Cet agent sortira de l'effectif suite à ce mouvement. Confirmer ?");
      if (!confirme) return;
    }
    creation.mutate(valeurs);
  }

  function surFermeture() {
    if (isDirty && !window.confirm("Des modifications non enregistrées seront perdues. Continuer ?")) return;
    onFermer();
  }

  const erreurGlobale =
    creation.isError && !(creation.error instanceof ErreurApi && creation.error.champ)
      ? creation.error instanceof ErreurApi
        ? creation.error.message
        : "Serveur injoignable. Réessayez plus tard."
      : null;

  return (
    <Modale ouverte={ouverte} titre="Ajouter un mouvement" onFermer={surFermeture}>
      <form className="flex flex-col gap-4" onSubmit={handleSubmit(surSoumission)}>
        <Selecteur
          id="mvt-type"
          etiquette="Type de mouvement"
          erreur={errors.type?.message}
          {...register("type")}
          options={typesProposes.map((t) => ({ valeur: t, libelle: LIBELLE_TYPE_MOUVEMENT[t] }))}
        />

        <Champ id="mvt-date-effet" etiquette="Date d'effet" type="date" required erreur={errors.dateEffet?.message} {...register("dateEffet")} />

        {(type === "CONGE" || type === "SUSPENSION") && (
          <div>
            <Champ
              id="mvt-date-fin"
              etiquette="Date de fin"
              type="date"
              required={type === "CONGE"}
              erreur={errors.dateFin?.message}
              {...register("dateFin")}
            />
            {duree !== null && <p className="mt-1 text-xs text-texte-faible">{duree} jour(s)</p>}
          </div>
        )}

        <Champ
          id="mvt-motif"
          etiquette={estDefinitif ? "Motif" : "Motif (facultatif)"}
          required={estDefinitif}
          erreur={errors.motif?.message}
          {...register("motif")}
        />

        {documentsDisponibles.length > 0 && (
          <Selecteur
            id="mvt-document"
            etiquette="Pièce justificative (facultatif)"
            erreur={errors.documentId?.message}
            {...register("documentId")}
            options={[{ valeur: "", libelle: "aucune" }, ...documentsDisponibles.map((d) => ({ valeur: d.id, libelle: d.nomOrigine }))]}
          />
        )}

        {erreurGlobale && (
          <p role="alert" className="border border-primaire bg-primaire/10 px-3 py-2 text-sm text-primaire">
            {erreurGlobale}
          </p>
        )}

        <div className="mt-2 flex justify-end gap-3">
          <Bouton type="button" variante="discret" onClick={surFermeture}>
            annuler
          </Bouton>
          <Bouton type="submit" variante="primaire" disabled={creation.isPending}>
            {creation.isPending ? "enregistrement…" : "enregistrer"}
          </Bouton>
        </div>
      </form>
    </Modale>
  );
}
