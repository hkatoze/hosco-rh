import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { ArrowLeft } from "lucide-react";
import { apiFetch, ErreurApi } from "../../api/client";
import type { AgentDetail, ServiceAvecEffectif, TypeDocument } from "../../api/types";
import { schemaCreationAgent, SEXES, SITUATIONS_MATRIMONIALES, TYPES_CONTRAT } from "../../../../shared/agent";
import { deposerDocument } from "../../api/uploadDocument";
import { useGardeSortie } from "../../hooks/useGardeSortie";
import { Champ } from "../../components/Champ";
import { Selecteur } from "../../components/Selecteur";
import { Bouton } from "../../components/Bouton";
import { DeposeDocument } from "../../components/documents/DeposeDocument";
import { formaterTaille } from "../../lib/validationFichier";

// Adapte le schéma partagé aux champs HTML optionnels : un <input type="date">
// ou un <select> vide renvoie "", pas undefined — sans ce préprocesseur,
// z.coerce.date() rejetterait la chaîne vide comme une date invalide même
// si le champ est optionnel. Uniquement côté front : le serveur reçoit du
// JSON avec de vraies valeurs null/absentes.
const videVersUndefined = (v: unknown) => (v === "" ? undefined : v);
const schemaFormulaire = schemaCreationAgent.extend({
  dateNaissance: z.preprocess(videVersUndefined, schemaCreationAgent.shape.dateNaissance),
  lieuNaissance: z.preprocess(videVersUndefined, schemaCreationAgent.shape.lieuNaissance),
  situationMatrimoniale: z.preprocess(videVersUndefined, schemaCreationAgent.shape.situationMatrimoniale),
  telephone: z.preprocess(videVersUndefined, schemaCreationAgent.shape.telephone),
  adresse: z.preprocess(videVersUndefined, schemaCreationAgent.shape.adresse),
  numeroCnss: z.preprocess(videVersUndefined, schemaCreationAgent.shape.numeroCnss),
});
type ValeursFormulaire = z.infer<typeof schemaFormulaire>;

function versValeursFormulaire(agent?: AgentDetail): Partial<ValeursFormulaire> {
  if (!agent) return { matricule: "" };
  return {
    matricule: agent.matricule,
    nom: agent.nom,
    prenom: agent.prenom,
    sexe: agent.sexe,
    dateNaissance: agent.dateNaissance ? (agent.dateNaissance.slice(0, 10) as unknown as Date) : undefined,
    lieuNaissance: agent.lieuNaissance ?? "",
    situationMatrimoniale: agent.situationMatrimoniale ?? undefined,
    telephone: agent.telephone ?? "",
    adresse: agent.adresse ?? "",
    numeroCnss: agent.numeroCnss ?? "",
    fonction: agent.fonction,
    dateRecrutement: agent.dateRecrutement.slice(0, 10) as unknown as Date,
    typeContrat: agent.typeContrat,
    serviceId: agent.serviceId,
  };
}

interface FormulaireAgentProps {
  mode: "creation" | "modification";
  agentExistant?: AgentDetail;
}

export function FormulaireAgent({ mode, agentExistant }: FormulaireAgentProps) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [fichiersEnAttente, setFichiersEnAttente] = useState<{ fichier: File; type: TypeDocument }[]>([]);
  const [envoiDocuments, setEnvoiDocuments] = useState<{ index: number; total: number } | null>(null);

  const { data: services } = useQuery({
    queryKey: ["services"],
    queryFn: () => apiFetch<ServiceAvecEffectif[]>("/api/services"),
    staleTime: 5 * 60_000,
  });

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isDirty, isSubmitSuccessful },
  } = useForm<ValeursFormulaire>({
    resolver: zodResolver(schemaFormulaire),
    mode: "onBlur",
    defaultValues: versValeursFormulaire(agentExistant),
  });

  // Le garde-fou ne doit plus se déclencher une fois l'enregistrement réussi
  // (sinon la redirection elle-même serait bloquée).
  useGardeSortie(isDirty && !isSubmitSuccessful);

  const enregistrement = useMutation({
    mutationFn: async (valeurs: ValeursFormulaire) => {
      if (mode === "creation") {
        return apiFetch<{ id: string }>("/api/agents", { method: "POST", body: JSON.stringify(valeurs) });
      }
      return apiFetch<{ id: string }>(`/api/agents/${agentExistant!.id}`, { method: "PATCH", body: JSON.stringify(valeurs) });
    },
    onSuccess: async (agent) => {
      if (fichiersEnAttente.length > 0) {
        for (let i = 0; i < fichiersEnAttente.length; i++) {
          setEnvoiDocuments({ index: i + 1, total: fichiersEnAttente.length });
          const { fichier, type } = fichiersEnAttente[i]!;
          try {
            await deposerDocument(agent.id, fichier, type, () => {});
          } catch {
            // Un document en échec ne doit pas bloquer la création déjà
            // réussie de l'agent : il pourra être redéposé depuis la fiche.
          }
        }
        setEnvoiDocuments(null);
      }
      await queryClient.invalidateQueries({ queryKey: ["agents"] });
      await queryClient.invalidateQueries({ queryKey: ["agent", agent.id] });
      navigate(`/personnel/${agent.id}`, { replace: true });
    },
    onError: (erreur) => {
      if (erreur instanceof ErreurApi && erreur.champ && erreur.champ in schemaFormulaire.shape) {
        setError(erreur.champ as keyof ValeursFormulaire, { message: erreur.message });
      }
    },
  });

  const erreurGlobale =
    enregistrement.isError && !(enregistrement.error instanceof ErreurApi && enregistrement.error.champ)
      ? enregistrement.error instanceof ErreurApi
        ? enregistrement.error.message
        : "Serveur injoignable. Réessayez plus tard."
      : null;

  const lienRetour = mode === "creation" ? "/personnel" : `/personnel/${agentExistant!.id}`;

  return (
    <div className="mx-auto flex max-w-[720px] flex-col gap-6">
      <Link to={lienRetour} className="inline-flex w-fit items-center gap-2 text-sm text-texte-faible hover:text-texte-fort">
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        {mode === "creation" ? "retour à l'annuaire" : "retour à la fiche"}
      </Link>

      <form className="flex flex-col gap-8" onSubmit={handleSubmit((v) => enregistrement.mutate(v))}>
      <h1 className="text-lg font-medium text-texte-fort">{mode === "creation" ? "Nouvel agent" : "Modifier l'agent"}</h1>

      <fieldset className="flex flex-col gap-4 border-t border-bordure pt-6">
        <legend className="mb-2 text-sm font-medium text-texte-fort">Identité</legend>
        <div className="flex flex-col gap-4 sm:flex-row">
          <div className="flex-1">
            <Champ id="nom" etiquette="Nom" required erreur={errors.nom?.message} {...register("nom")} />
          </div>
          <div className="flex-1">
            <Champ id="prenom" etiquette="Prénom" required erreur={errors.prenom?.message} {...register("prenom")} />
          </div>
        </div>
        <div className="flex flex-col gap-4 sm:flex-row">
          <div className="flex-1">
            <Selecteur
              id="sexe"
              etiquette="Genre"
              required
              erreur={errors.sexe?.message}
              {...register("sexe")}
              options={[{ valeur: "", libelle: "Sélectionnez…" }, ...SEXES.map((s) => ({ valeur: s, libelle: s === "MASCULIN" ? "Masculin" : "Féminin" }))]}
            />
          </div>
          <div className="flex-1">
            <Champ id="date-naissance" etiquette="Date de naissance" type="date" erreur={errors.dateNaissance?.message} {...register("dateNaissance")} />
          </div>
        </div>
        <Champ id="lieu-naissance" etiquette="Lieu de naissance" erreur={errors.lieuNaissance?.message} {...register("lieuNaissance")} />
        <Selecteur
          id="situation-matrimoniale"
          etiquette="Situation matrimoniale"
          erreur={errors.situationMatrimoniale?.message}
          {...register("situationMatrimoniale")}
          options={[
            { valeur: "", libelle: "Sélectionnez…" },
            ...SITUATIONS_MATRIMONIALES.map((s) => ({ valeur: s, libelle: LIBELLE_SITUATION[s] })),
          ]}
        />
        <Champ id="telephone" etiquette="Téléphone" erreur={errors.telephone?.message} {...register("telephone")} />
        <Champ id="adresse" etiquette="Adresse" erreur={errors.adresse?.message} {...register("adresse")} />
      </fieldset>

      <fieldset className="flex flex-col gap-4 border-t border-bordure pt-6">
        <legend className="mb-2 text-sm font-medium text-texte-fort">Situation administrative</legend>
        <div>
          <Champ
            id="matricule"
            etiquette="Matricule"
            required={mode === "creation"}
            readOnly={mode === "modification"}
            disabled={mode === "modification"}
            erreur={errors.matricule?.message}
            {...register("matricule")}
          />
          {mode === "modification" && <p className="mt-1 text-xs text-texte-faible">le matricule est définitif, il ne peut pas être modifié.</p>}
        </div>
        <Champ id="fonction" etiquette="Fonction" required erreur={errors.fonction?.message} {...register("fonction")} />
        <Selecteur
          id="service"
          etiquette="Service"
          required
          erreur={errors.serviceId?.message}
          {...register("serviceId")}
          options={[{ valeur: "", libelle: "Sélectionnez…" }, ...(services ?? []).map((s) => ({ valeur: s.id, libelle: s.nom }))]}
        />
        <div className="flex flex-col gap-4 sm:flex-row">
          <div className="flex-1">
            <Selecteur
              id="type-contrat"
              etiquette="Type de contrat"
              required
              erreur={errors.typeContrat?.message}
              {...register("typeContrat")}
              options={[{ valeur: "", libelle: "Sélectionnez…" }, ...TYPES_CONTRAT.map((t) => ({ valeur: t, libelle: t }))]}
            />
          </div>
          <div className="flex-1">
            <Champ
              id="date-recrutement"
              etiquette="Date de recrutement"
              type="date"
              required
              erreur={errors.dateRecrutement?.message}
              {...register("dateRecrutement")}
            />
          </div>
        </div>
        <Champ id="numero-cnss" etiquette="Numéro CNSS" erreur={errors.numeroCnss?.message} {...register("numeroCnss")} />
      </fieldset>

      <fieldset className="flex flex-col gap-4 border-t border-bordure pt-6">
        <legend className="mb-2 text-sm font-medium text-texte-fort">Documents</legend>
        <DeposeDocument
          onFichier={async (fichier, type) => {
            setFichiersEnAttente((liste) => [...liste, { fichier, type }]);
          }}
        />
        {fichiersEnAttente.length > 0 && (
          <ul className="flex flex-col gap-1 text-sm text-texte-faible">
            {fichiersEnAttente.map((f, i) => (
              <li key={i} className="flex items-center justify-between border border-bordure px-3 py-2">
                <span className="truncate">
                  {f.fichier.name} — {formaterTaille(f.fichier.size)}
                </span>
                <button
                  type="button"
                  onClick={() => setFichiersEnAttente((liste) => liste.filter((_, idx) => idx !== i))}
                  className="ml-3 shrink-0 text-primaire"
                  aria-label={`retirer ${f.fichier.name}`}
                >
                  retirer
                </button>
              </li>
            ))}
          </ul>
        )}
      </fieldset>

      {erreurGlobale && (
        <p role="alert" className="border border-primaire bg-primaire/10 px-3 py-2 text-sm text-primaire">
          {erreurGlobale}
        </p>
      )}

      <div className="flex justify-end gap-3">
        <Bouton type="button" variante="discret" onClick={() => navigate(-1)}>
          annuler
        </Bouton>
        <Bouton type="submit" variante="primaire" disabled={enregistrement.isPending || envoiDocuments !== null}>
          {envoiDocuments
            ? `envoi des documents (${envoiDocuments.index}/${envoiDocuments.total})…`
            : enregistrement.isPending
              ? "enregistrement…"
              : "enregistrer"}
        </Bouton>
      </div>
      </form>
    </div>
  );
}

const LIBELLE_SITUATION: Record<(typeof SITUATIONS_MATRIMONIALES)[number], string> = {
  CELIBATAIRE: "Célibataire",
  MARIE: "Marié(e)",
  DIVORCE: "Divorcé(e)",
  VEUF: "Veuf(ve)",
};
