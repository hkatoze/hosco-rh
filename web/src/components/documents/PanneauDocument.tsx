import { useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch, ErreurApi } from "../../api/client";
import type { DocumentAgent } from "../../api/types";
import { LIBELLE_TYPE_DOCUMENT } from "../../../../shared/document";
import { formaterTaille } from "../../lib/validationFichier";
import { useFocusTrap } from "../../hooks/useFocusTrap";
import { Bouton } from "../Bouton";

interface PanneauDocumentProps {
  document: DocumentAgent;
  agentId: string;
  onFermer: () => void;
  peutSupprimer: boolean;
}

/** Panneau latéral : PDF affiché via /fichier, image en visionneuse — voir CLAUDE.md, tâche 6, point 3. */
export function PanneauDocument({ document, agentId, onFermer, peutSupprimer }: PanneauDocumentProps) {
  const [confirmation, setConfirmation] = useState(false);
  const conteneur = useRef<HTMLDivElement>(null);
  useFocusTrap(conteneur, true, onFermer);
  const queryClient = useQueryClient();

  const urlFichier = `/api/documents/${document.id}/fichier`;
  const estPdf = document.mimeType === "application/pdf";

  const suppression = useMutation({
    mutationFn: () => apiFetch(`/api/documents/${document.id}`, { method: "DELETE" }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["agent", agentId] });
      onFermer();
    },
  });

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/40" role="dialog" aria-modal="true" aria-label={document.nomOrigine} onClick={onFermer}>
      <div
        ref={conteneur}
        tabIndex={-1}
        className="flex h-full w-full max-w-xl flex-col border-l border-bordure bg-fond-carte shadow-carte"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-3 border-b border-bordure p-4">
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-texte-fort">{document.nomOrigine}</p>
            <p className="text-xs text-texte-faible">
              {LIBELLE_TYPE_DOCUMENT[document.type]} — {formaterTaille(document.tailleOctets)}
            </p>
          </div>
          <button type="button" onClick={onFermer} aria-label="fermer" className="shrink-0 border border-transparent px-2 py-1 text-texte-faible hover:border-bordure">
            ✕
          </button>
        </div>

        <div className="flex flex-1 items-center justify-center overflow-auto bg-black/20 p-4">
          {estPdf ? (
            <iframe src={urlFichier} title={document.nomOrigine} className="h-full w-full border-0" />
          ) : (
            <img src={urlFichier} alt={document.nomOrigine} className="max-h-full max-w-full object-contain" />
          )}
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-bordure p-4">
          <a href={urlFichier} download={document.nomOrigine}>
            <Bouton type="button" variante="secondaire">
              télécharger
            </Bouton>
          </a>

          {peutSupprimer && (
            <div className="flex items-center gap-3">
              {confirmation && <span className="text-xs text-texte-faible">part en corbeille 90 jours</span>}
              <Bouton
                type="button"
                variante="primaire"
                disabled={suppression.isPending}
                onClick={() => {
                  if (!confirmation) {
                    setConfirmation(true);
                    return;
                  }
                  suppression.mutate();
                }}
              >
                {confirmation ? "confirmer la suppression" : "supprimer"}
              </Bouton>
            </div>
          )}
        </div>
        {suppression.isError && (
          <p role="alert" className="border-t border-bordure px-4 py-2 text-sm text-primaire">
            {suppression.error instanceof ErreurApi ? suppression.error.message : "Échec de la suppression."}
          </p>
        )}
      </div>
    </div>
  );
}
