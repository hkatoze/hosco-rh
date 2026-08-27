import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, ArrowLeft, FileText, Pencil, Plus, Trash2 } from "lucide-react";
import { apiFetch, ErreurApi } from "../api/client";
import type { AgentDetail, DocumentAgent, Mouvement } from "../api/types";
import { useSession } from "../hooks/useSession";
import { roleSuffisant } from "../lib/roles";
import { LIBELLE_STATUT, COULEUR_STATUT } from "../lib/statut";
import { LIBELLE_TYPE_MOUVEMENT } from "../lib/mouvement";
import { LIBELLE_TYPE_DOCUMENT } from "../../../shared/document";
import { Badge } from "../components/Badge";
import { Bouton } from "../components/Bouton";
import { Alerte } from "../components/Alerte";
import { Modale } from "../components/Modale";
import { Cellule, CelluleEntete, EnteteTableau, LigneTableau, Tableau } from "../components/Tableau";
import { AjouterDocumentModale } from "../components/documents/AjouterDocumentModale";
import { PanneauDocument } from "../components/documents/PanneauDocument";
import { MouvementModal } from "../components/mouvements/MouvementModal";
import { AnnulerMouvementModale } from "../components/mouvements/AnnulerMouvementModale";

function formaterDate(iso: string): string {
  return new Date(iso).toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

const LIBELLE_SEXE: Record<string, string> = { MASCULIN: "Masculin", FEMININ: "Féminin" };
const LIBELLE_SITUATION: Record<string, string> = { CELIBATAIRE: "Célibataire", MARIE: "Marié(e)", DIVORCE: "Divorcé(e)", VEUF: "Veuf(ve)" };

export function FicheAgent() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data: utilisateur } = useSession();
  const [documentOuvert, setDocumentOuvert] = useState<DocumentAgent | null>(null);
  const [ajoutDocumentOuvert, setAjoutDocumentOuvert] = useState(false);
  const [mouvementModalOuverte, setMouvementModalOuverte] = useState(false);
  const [valeursInitialesMouvement, setValeursInitialesMouvement] = useState<{ dateEffet?: string } | undefined>();
  const [mouvementAAnnuler, setMouvementAAnnuler] = useState<Mouvement | null>(null);
  const [confirmationSuppression, setConfirmationSuppression] = useState(false);

  const {
    data: agent,
    isLoading,
    isError,
    error,
  } = useQuery({
    queryKey: ["agent", id],
    queryFn: () => apiFetch<AgentDetail>(`/api/agents/${id}`),
    enabled: Boolean(id),
  });

  const peutModifier = utilisateur ? roleSuffisant(utilisateur.role, "SAISIE") : false;
  const peutSupprimerDocument = utilisateur ? roleSuffisant(utilisateur.role, "ADMIN") : false;
  const peutAnnulerMouvement = utilisateur ? roleSuffisant(utilisateur.role, "ADMIN") : false;
  const peutSupprimerAgent = utilisateur ? roleSuffisant(utilisateur.role, "ADMIN") : false;

  const suppressionAgent = useMutation({
    mutationFn: () => apiFetch(`/api/agents/${id}`, { method: "DELETE" }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["agents"] });
      navigate("/personnel", { replace: true });
    },
  });

  if (isLoading) return null;
  if (isError || !agent) {
    return (
      <div className="flex flex-col gap-6">
        <Link to="/personnel" className="inline-flex w-fit items-center gap-2 text-sm text-texte-faible hover:text-texte-fort">
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          retour à l'annuaire
        </Link>
        <Alerte
          variante="erreur"
          titre="Agent introuvable"
          description={error instanceof ErreurApi ? error.message : "Impossible de charger cet agent."}
        />
      </div>
    );
  }

  const dernierCongeDepasse =
    agent.statut === "CONGE_DEPASSE"
      ? [...agent.mouvements].filter((m) => m.type === "CONGE" && m.dateFin && !m.annuleLe).sort((a, b) => (a.dateEffet < b.dateEffet ? 1 : -1))[0]
      : undefined;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between gap-6">
        <Link to="/personnel" className="inline-flex w-fit items-center gap-2 text-sm text-texte-faible hover:text-texte-fort">
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          retour à l'annuaire
        </Link>
        {peutModifier && (
          <Link to={`/personnel/${agent.id}/modifier`}>
            <Bouton type="button" variante="secondaire">
              <Pencil className="h-4 w-4" aria-hidden="true" />
              modifier
            </Bouton>
          </Link>
        )}
      </div>

      {agent.statut === "CONGE_DEPASSE" && dernierCongeDepasse?.dateFin && (
        <div className="flex flex-wrap items-center justify-between gap-3 border border-primaire bg-primaire/10 px-4 py-3">
          <p className="flex items-center gap-2 text-sm text-primaire">
            <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" />
            Le congé de cet agent s'est terminé le {formaterDate(dernierCongeDepasse.dateFin)}, aucun retour n'a été saisi.
          </p>
          {peutModifier && (
            <Bouton
              variante="primaire"
              onClick={() => {
                // Il n'existe pas de mouvement "retour de congé" (voir CLAUDE.md :
                // l'agent redevient actif de lui-même à l'échéance) — on ouvre la
                // saisie avec la date pré-remplie au lendemain de la fin de congé,
                // pour que l'utilisateur enregistre ce qui s'est réellement passé.
                const lendemain = new Date(dernierCongeDepasse.dateFin!);
                lendemain.setDate(lendemain.getDate() + 1);
                setValeursInitialesMouvement({ dateEffet: lendemain.toISOString().slice(0, 10) });
                setMouvementModalOuverte(true);
              }}
            >
              saisir un mouvement
            </Bouton>
          )}
        </div>
      )}

      {/* Entête */}
      <div className="flex items-start gap-4">
        {agent.photoPath ? (
          <img src={`/api/agents/${agent.id}/photo`} alt="" className="h-24 w-24 border border-bordure object-cover" />
        ) : (
          <div className="flex h-24 w-24 items-center justify-center border border-bordure bg-fond-carte text-2xl font-medium text-texte-faible">
            {agent.prenom[0]}
            {agent.nom[0]}
          </div>
        )}
        <div>
          <h1 className="text-lg font-medium text-texte-fort">
            {agent.nom}, {agent.prenom}
          </h1>
          <p className="text-sm text-texte-faible">
            {agent.fonction} — {agent.service.nom}
          </p>
          <p className="mt-1 text-xs text-texte-faible">
            Matricule {agent.matricule} — Recruté le {formaterDate(agent.dateRecrutement)} — {agent.typeContrat}
          </p>
          <div className="mt-2">
            <Badge couleur={COULEUR_STATUT[agent.statut]}>{LIBELLE_STATUT[agent.statut]}</Badge>
          </div>
        </div>
      </div>

      {/* Informations */}
      <div className="border-t border-bordure pt-6">
        <h2 className="mb-4 text-sm font-medium text-texte-fort">Informations</h2>
        <dl className="grid grid-cols-1 gap-x-8 gap-y-4 sm:grid-cols-2">
          <InfoItem etiquette="Date de naissance" valeur={agent.dateNaissance ? formaterDate(agent.dateNaissance) : null} />
          <InfoItem etiquette="Genre" valeur={LIBELLE_SEXE[agent.sexe] ?? agent.sexe} />
          <InfoItem etiquette="Lieu de naissance" valeur={agent.lieuNaissance} />
          <InfoItem etiquette="Situation matrimoniale" valeur={agent.situationMatrimoniale ? LIBELLE_SITUATION[agent.situationMatrimoniale] : null} />
          <InfoItem etiquette="Téléphone" valeur={agent.telephone} />
          <InfoItem etiquette="Adresse" valeur={agent.adresse} />
          <InfoItem etiquette="Numéro CNSS" valeur={agent.numeroCnss} />
        </dl>
      </div>

      {/* Documents */}
      <div className="border-t border-bordure pt-6">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-sm font-medium text-texte-fort">Documents</h2>
          {peutModifier && (
            <Bouton type="button" variante="secondaire" onClick={() => setAjoutDocumentOuvert(true)}>
              <Plus className="h-4 w-4" aria-hidden="true" />
              ajouter un document
            </Bouton>
          )}
        </div>
        {agent.documents.length === 0 ? (
          <p className="text-sm text-texte-faible">Aucun document déposé.</p>
        ) : (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
            {agent.documents.map((document) => (
              <button
                key={document.id}
                type="button"
                onClick={() => setDocumentOuvert(document)}
                className="flex aspect-square flex-col items-center justify-center gap-2 border border-bordure bg-fond-carte p-3 text-center hover:border-texte-faible"
              >
                {document.mimeType.startsWith("image/") ? (
                  <img src={`/api/documents/${document.id}/fichier`} alt="" className="h-16 w-16 object-cover" />
                ) : (
                  <FileText className="h-10 w-10 text-texte-faible" aria-hidden="true" />
                )}
                <span className="w-full truncate text-xs text-texte-faible">{LIBELLE_TYPE_DOCUMENT[document.type]}</span>
                <span className="w-full truncate text-xs text-texte-faible">{document.nomOrigine}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Mouvements */}
      <div className="border-t border-bordure pt-6">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-sm font-medium text-texte-fort">Mouvements</h2>
          {peutModifier && (
            <Bouton
              type="button"
              variante="secondaire"
              onClick={() => {
                setValeursInitialesMouvement(undefined);
                setMouvementModalOuverte(true);
              }}
            >
              <Plus className="h-4 w-4" aria-hidden="true" />
              ajouter un mouvement
            </Bouton>
          )}
        </div>

        <Tableau>
          <EnteteTableau>
            <tr>
              <CelluleEntete>Date</CelluleEntete>
              <CelluleEntete>Type</CelluleEntete>
              <CelluleEntete>Période</CelluleEntete>
              <CelluleEntete>Motif</CelluleEntete>
              <CelluleEntete>Saisi par</CelluleEntete>
              {peutAnnulerMouvement && <CelluleEntete>Action</CelluleEntete>}
            </tr>
          </EnteteTableau>
          <tbody>
            {agent.mouvements.map((mouvement) => {
              const annule = Boolean(mouvement.annuleLe);
              return (
                <LigneTableau key={mouvement.id}>
                  <Cellule>
                    <span className={annule ? "text-texte-faible line-through" : undefined} title={annule ? (mouvement.motifAnnulation ?? undefined) : undefined}>
                      {formaterDate(mouvement.dateEffet)}
                    </span>
                  </Cellule>
                  <Cellule>
                    <span className={annule ? "text-texte-faible line-through" : undefined} title={annule ? (mouvement.motifAnnulation ?? undefined) : undefined}>
                      {LIBELLE_TYPE_MOUVEMENT[mouvement.type]}
                    </span>
                  </Cellule>
                  <Cellule>
                    <span className={annule ? "text-texte-faible line-through" : undefined}>
                      {mouvement.dateFin ? `${formaterDate(mouvement.dateEffet)} — ${formaterDate(mouvement.dateFin)}` : "—"}
                    </span>
                  </Cellule>
                  <Cellule>
                    <span className={annule ? "text-texte-faible line-through" : undefined}>{mouvement.motif ?? "—"}</span>
                  </Cellule>
                  <Cellule>
                    <span className={annule ? "text-texte-faible line-through" : undefined}>{mouvement.saisiPar.nom}</span>
                  </Cellule>
                  {peutAnnulerMouvement && (
                    <Cellule>
                      {!annule && mouvement.type !== "RECRUTEMENT" && (
                        <Bouton type="button" variante="discret" onClick={() => setMouvementAAnnuler(mouvement)}>
                          annuler
                        </Bouton>
                      )}
                    </Cellule>
                  )}
                </LigneTableau>
              );
            })}
          </tbody>
        </Tableau>
      </div>

      {peutSupprimerAgent && (
        <div className="flex justify-end border-t border-bordure pt-6">
          <Bouton type="button" variante="primaire" onClick={() => setConfirmationSuppression(true)}>
            <Trash2 className="h-4 w-4" aria-hidden="true" />
            supprimer cet agent
          </Bouton>
        </div>
      )}

      {documentOuvert && (
        <PanneauDocument document={documentOuvert} agentId={agent.id} peutSupprimer={peutSupprimerDocument} onFermer={() => setDocumentOuvert(null)} />
      )}

      <AjouterDocumentModale agentId={agent.id} ouverte={ajoutDocumentOuvert} onFermer={() => setAjoutDocumentOuvert(false)} />

      <MouvementModal
        agentId={agent.id}
        ouverte={mouvementModalOuverte}
        onFermer={() => setMouvementModalOuverte(false)}
        statutActuel={agent.statut}
        documentsDisponibles={agent.documents}
        valeursInitiales={valeursInitialesMouvement}
      />

      {mouvementAAnnuler && (
        <AnnulerMouvementModale
          mouvementId={mouvementAAnnuler.id}
          agentId={agent.id}
          ouverte={true}
          onFermer={() => setMouvementAAnnuler(null)}
        />
      )}

      <Modale ouverte={confirmationSuppression} titre="Supprimer cet agent" onFermer={() => setConfirmationSuppression(false)}>
        <div className="flex flex-col gap-4">
          <p className="text-sm text-texte-fort">
            Vous êtes sur le point de supprimer la fiche de <strong>{agent.nom}, {agent.prenom}</strong> ({agent.matricule}).
          </p>
          <ul className="list-disc space-y-2 pl-5 text-sm text-texte-faible">
            <li>L'agent disparaît immédiatement de l'annuaire, de la recherche et du décompte des services.</li>
            <li>Son historique (mouvements, documents) est conservé en base, pas détruit.</li>
            <li>Il n'existe aujourd'hui aucune fonction de restauration dans l'interface : ramener cet agent nécessiterait une intervention technique directe en base de données.</li>
            <li>Cette action est réservée aux administrateurs et est enregistrée dans le journal d'audit.</li>
          </ul>

          {suppressionAgent.isError && (
            <p role="alert" className="border border-primaire bg-primaire/10 px-3 py-2 text-sm text-primaire">
              {suppressionAgent.error instanceof ErreurApi ? suppressionAgent.error.message : "Échec de la suppression."}
            </p>
          )}

          <div className="mt-2 flex justify-end gap-3">
            <Bouton type="button" variante="discret" onClick={() => setConfirmationSuppression(false)} disabled={suppressionAgent.isPending}>
              annuler
            </Bouton>
            <Bouton type="button" variante="primaire" disabled={suppressionAgent.isPending} onClick={() => suppressionAgent.mutate()}>
              <Trash2 className="h-4 w-4" aria-hidden="true" />
              {suppressionAgent.isPending ? "suppression…" : "supprimer définitivement de l'annuaire"}
            </Bouton>
          </div>
        </div>
      </Modale>
    </div>
  );
}

function InfoItem({ etiquette, valeur }: { etiquette: string; valeur: string | null | undefined }) {
  return (
    <div>
      <dt className="text-xs text-texte-faible">{etiquette}</dt>
      <dd className="text-sm text-texte-fort">{valeur || "—"}</dd>
    </div>
  );
}
