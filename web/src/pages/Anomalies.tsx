import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { apiFetch, ErreurApi } from "../api/client";
import type { Anomalie } from "../api/types";
import { Alerte } from "../components/Alerte";
import { Badge } from "../components/Badge";
import { Cellule, CelluleEntete, EnteteTableau, LigneSquelette, LigneTableau, Tableau } from "../components/Tableau";

function formaterDate(iso: string): string {
  return new Date(iso).toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

export function Anomalies() {
  const navigate = useNavigate();

  const {
    data: anomalies,
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery({
    queryKey: ["anomalies"],
    queryFn: () => apiFetch<Anomalie[]>("/api/anomalies"),
  });

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-lg font-medium text-texte-fort">Anomalies</h1>
        <p className="text-sm text-texte-faible">Congés dont la date de fin est dépassée sans qu'aucun retour n'ait été saisi.</p>
      </div>

      {isError ? (
        <Alerte
          variante="erreur"
          titre={error instanceof ErreurApi && error.status === 0 ? "Serveur injoignable" : "Une erreur est survenue"}
          description={error instanceof ErreurApi ? error.message : "Impossible de charger les anomalies."}
          action={{ libelle: "Réessayer", onClick: () => refetch() }}
        />
      ) : !isLoading && anomalies && anomalies.length === 0 ? (
        <Alerte titre="Aucune anomalie" description="Tous les congés en cours ou passés ont un statut à jour." />
      ) : (
        <Tableau>
          <EnteteTableau>
            <tr>
              <CelluleEntete>Agent</CelluleEntete>
              <CelluleEntete>Matricule</CelluleEntete>
              <CelluleEntete>Service</CelluleEntete>
              <CelluleEntete>Congé terminé le</CelluleEntete>
              <CelluleEntete>Dépassement</CelluleEntete>
            </tr>
          </EnteteTableau>
          <tbody>
            {isLoading
              ? Array.from({ length: 5 }).map((_, i) => <LigneSquelette key={i} colonnes={5} />)
              : anomalies?.map((anomalie) => (
                  <LigneTableau key={anomalie.id} onClick={() => navigate(`/personnel/${anomalie.id}`)}>
                    <Cellule>
                      {anomalie.nom}, {anomalie.prenom}
                    </Cellule>
                    <Cellule>{anomalie.matricule}</Cellule>
                    <Cellule>{anomalie.service}</Cellule>
                    <Cellule>{formaterDate(anomalie.dateFinConge)}</Cellule>
                    <Cellule>
                      <Badge couleur={anomalie.joursDepassement > 30 ? "rouge" : "ambre"}>
                        {anomalie.joursDepassement} jour{anomalie.joursDepassement > 1 ? "s" : ""}
                      </Badge>
                    </Cellule>
                  </LigneTableau>
                ))}
          </tbody>
        </Tableau>
      )}
    </div>
  );
}
