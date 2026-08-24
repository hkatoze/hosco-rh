import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { RotateCcw } from "lucide-react";
import { apiFetch, ErreurApi } from "../../api/client";
import type { Corbeille } from "../../api/types";
import { LIBELLE_TYPE_DOCUMENT } from "../../../../shared/document";
import { Bouton } from "../../components/Bouton";
import { Alerte } from "../../components/Alerte";
import { Cellule, CelluleEntete, EnteteTableau, LigneTableau, Tableau } from "../../components/Tableau";

function formaterDate(iso: string): string {
  return new Date(iso).toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

export function CorbeilleSection() {
  const queryClient = useQueryClient();

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["corbeille"],
    queryFn: () => apiFetch<Corbeille>("/api/corbeille"),
  });

  const restaurerAgent = useMutation({
    mutationFn: (id: string) => apiFetch(`/api/corbeille/agents/${id}/restaurer`, { method: "POST" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["corbeille"] });
      queryClient.invalidateQueries({ queryKey: ["agents"] });
    },
    onError: (e) => window.alert(e instanceof ErreurApi ? e.message : "Échec de la restauration."),
  });

  const restaurerDocument = useMutation({
    mutationFn: (id: string) => apiFetch(`/api/corbeille/documents/${id}/restaurer`, { method: "POST" }),
    onSuccess: (_donnees, id) => {
      queryClient.invalidateQueries({ queryKey: ["corbeille"] });
      const document = data?.documents.find((d) => d.id === id);
      if (document) queryClient.invalidateQueries({ queryKey: ["agent", document.agent.id] });
    },
    onError: (e) => window.alert(e instanceof ErreurApi ? e.message : "Échec de la restauration."),
  });

  if (isError) {
    return (
      <Alerte
        variante="erreur"
        titre="Impossible de charger la corbeille"
        description={error instanceof ErreurApi ? error.message : undefined}
        action={{ libelle: "réessayer", onClick: () => refetch() }}
      />
    );
  }

  return (
    <div className="flex flex-col gap-8">
      <p className="text-sm text-texte-faible">
        Les éléments supprimés sont conservés 90 jours avant purge définitive. Restaurer un élément le rend à nouveau visible dans l'application.
      </p>

      <div>
        <h2 className="mb-3 text-sm font-medium text-texte-fort">Agents</h2>
        {!isLoading && data?.agents.length === 0 ? (
          <p className="text-sm text-texte-faible">Aucun agent dans la corbeille.</p>
        ) : (
          <Tableau>
            <EnteteTableau>
              <tr>
                <CelluleEntete>Agent</CelluleEntete>
                <CelluleEntete>Matricule</CelluleEntete>
                <CelluleEntete>Supprimé le</CelluleEntete>
                <CelluleEntete>Par</CelluleEntete>
                <CelluleEntete>Purge définitive dans</CelluleEntete>
                <CelluleEntete>Action</CelluleEntete>
              </tr>
            </EnteteTableau>
            <tbody>
              {data?.agents.map((agent) => (
                <LigneTableau key={agent.id}>
                  <Cellule>
                    {agent.nom}, {agent.prenom}
                  </Cellule>
                  <Cellule>{agent.matricule}</Cellule>
                  <Cellule>{formaterDate(agent.supprimeLe)}</Cellule>
                  <Cellule>{agent.supprimePar ?? "—"}</Cellule>
                  <Cellule>{agent.joursRestants} jour(s)</Cellule>
                  <Cellule>
                    <Bouton type="button" variante="discret" disabled={restaurerAgent.isPending} onClick={() => restaurerAgent.mutate(agent.id)}>
                      <RotateCcw className="h-4 w-4" aria-hidden="true" />
                      restaurer
                    </Bouton>
                  </Cellule>
                </LigneTableau>
              ))}
            </tbody>
          </Tableau>
        )}
      </div>

      <div>
        <h2 className="mb-3 text-sm font-medium text-texte-fort">Documents</h2>
        {!isLoading && data?.documents.length === 0 ? (
          <p className="text-sm text-texte-faible">Aucun document dans la corbeille.</p>
        ) : (
          <Tableau>
            <EnteteTableau>
              <tr>
                <CelluleEntete>Document</CelluleEntete>
                <CelluleEntete>Type</CelluleEntete>
                <CelluleEntete>Agent</CelluleEntete>
                <CelluleEntete>Supprimé le</CelluleEntete>
                <CelluleEntete>Par</CelluleEntete>
                <CelluleEntete>Purge définitive dans</CelluleEntete>
                <CelluleEntete>Action</CelluleEntete>
              </tr>
            </EnteteTableau>
            <tbody>
              {data?.documents.map((document) => (
                <LigneTableau key={document.id}>
                  <Cellule>{document.nomOrigine}</Cellule>
                  <Cellule>{LIBELLE_TYPE_DOCUMENT[document.type]}</Cellule>
                  <Cellule>
                    {document.agent.nom}, {document.agent.prenom} ({document.agent.matricule})
                  </Cellule>
                  <Cellule>{formaterDate(document.supprimeLe)}</Cellule>
                  <Cellule>{document.supprimePar ?? "—"}</Cellule>
                  <Cellule>{document.joursRestants} jour(s)</Cellule>
                  <Cellule>
                    <Bouton type="button" variante="discret" disabled={restaurerDocument.isPending} onClick={() => restaurerDocument.mutate(document.id)}>
                      <RotateCcw className="h-4 w-4" aria-hidden="true" />
                      restaurer
                    </Bouton>
                  </Cellule>
                </LigneTableau>
              ))}
            </tbody>
          </Tableau>
        )}
      </div>
    </div>
  );
}
