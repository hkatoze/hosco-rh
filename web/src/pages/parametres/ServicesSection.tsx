import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { apiFetch, ErreurApi } from "../../api/client";
import type { ServiceAdmin } from "../../api/types";
import { Bouton } from "../../components/Bouton";
import { Champ } from "../../components/Champ";
import { Badge } from "../../components/Badge";
import { Modale } from "../../components/Modale";
import { Alerte } from "../../components/Alerte";
import { Cellule, CelluleEntete, EnteteTableau, LigneTableau, Tableau } from "../../components/Tableau";

interface ValeursFormulaire {
  nom: string;
  code: string;
}

function FormulaireService({
  service,
  onFermer,
}: {
  service: ServiceAdmin | null;
  onFermer: () => void;
}) {
  const queryClient = useQueryClient();
  const [valeurs, setValeurs] = useState<ValeursFormulaire>({ nom: service?.nom ?? "", code: service?.code ?? "" });

  const enregistrement = useMutation({
    mutationFn: () =>
      service
        ? apiFetch(`/api/services/${service.id}`, { method: "PATCH", body: JSON.stringify(valeurs) })
        : apiFetch("/api/services", { method: "POST", body: JSON.stringify(valeurs) }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["services"] });
      onFermer();
    },
  });

  return (
    <Modale ouverte titre={service ? "Modifier le service" : "Ajouter un service"} onFermer={onFermer}>
      <form
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          enregistrement.mutate();
        }}
      >
        <Champ id="service-nom" etiquette="Nom" required value={valeurs.nom} onChange={(e) => setValeurs((v) => ({ ...v, nom: e.target.value }))} />
        <Champ id="service-code" etiquette="Code" required value={valeurs.code} onChange={(e) => setValeurs((v) => ({ ...v, code: e.target.value }))} />

        {enregistrement.isError && (
          <p role="alert" className="border border-primaire bg-primaire/10 px-3 py-2 text-sm text-primaire">
            {enregistrement.error instanceof ErreurApi ? enregistrement.error.message : "Échec de l'enregistrement."}
          </p>
        )}

        <div className="mt-2 flex justify-end gap-3">
          <Bouton type="button" variante="discret" onClick={onFermer}>
            annuler
          </Bouton>
          <Bouton type="submit" variante="primaire" disabled={enregistrement.isPending}>
            {enregistrement.isPending ? "enregistrement…" : "enregistrer"}
          </Bouton>
        </div>
      </form>
    </Modale>
  );
}

export function ServicesSection() {
  const queryClient = useQueryClient();
  const [formulaireOuvert, setFormulaireOuvert] = useState<"nouveau" | ServiceAdmin | null>(null);

  const { data: services, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["services", "toutes"],
    queryFn: () => apiFetch<ServiceAdmin[]>("/api/services/toutes"),
  });

  const bascule = useMutation({
    mutationFn: (service: ServiceAdmin) => apiFetch(`/api/services/${service.id}`, { method: "PATCH", body: JSON.stringify({ actif: !service.actif }) }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["services"] }),
  });

  const suppression = useMutation({
    mutationFn: (id: string) => apiFetch(`/api/services/${id}`, { method: "DELETE" }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["services"] }),
    onError: (e) => window.alert(e instanceof ErreurApi ? e.message : "Échec de la suppression."),
  });

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-texte-faible">Un service désactivé n'apparaît plus dans les listes de l'annuaire.</p>
        <Bouton type="button" variante="primaire" onClick={() => setFormulaireOuvert("nouveau")}>
          <Plus className="h-4 w-4" aria-hidden="true" />
          ajouter un service
        </Bouton>
      </div>

      {isError ? (
        <Alerte
          variante="erreur"
          titre="Impossible de charger les services"
          description={error instanceof ErreurApi ? error.message : undefined}
          action={{ libelle: "réessayer", onClick: () => refetch() }}
        />
      ) : (
        <Tableau>
          <EnteteTableau>
            <tr>
              <CelluleEntete>Nom</CelluleEntete>
              <CelluleEntete>Code</CelluleEntete>
              <CelluleEntete>Effectif</CelluleEntete>
              <CelluleEntete>Statut</CelluleEntete>
              <CelluleEntete>Actions</CelluleEntete>
            </tr>
          </EnteteTableau>
          <tbody>
            {!isLoading &&
              services?.map((service) => (
                <LigneTableau key={service.id}>
                  <Cellule>{service.nom}</Cellule>
                  <Cellule>{service.code}</Cellule>
                  <Cellule>{service.effectif}</Cellule>
                  <Cellule>
                    <Badge couleur={service.actif ? "vert" : "gris"}>{service.actif ? "actif" : "inactif"}</Badge>
                  </Cellule>
                  <Cellule>
                    <div className="flex gap-2">
                      <Bouton type="button" variante="discret" onClick={() => setFormulaireOuvert(service)}>
                        modifier
                      </Bouton>
                      <Bouton type="button" variante="discret" disabled={bascule.isPending} onClick={() => bascule.mutate(service)}>
                        {service.actif ? "désactiver" : "activer"}
                      </Bouton>
                      {service.effectif === 0 && (
                        <Bouton
                          type="button"
                          variante="discret"
                          disabled={suppression.isPending}
                          onClick={() => {
                            if (window.confirm(`Supprimer définitivement le service « ${service.nom} » ?`)) suppression.mutate(service.id);
                          }}
                        >
                          supprimer
                        </Bouton>
                      )}
                    </div>
                  </Cellule>
                </LigneTableau>
              ))}
          </tbody>
        </Tableau>
      )}

      {formulaireOuvert && (
        <FormulaireService service={formulaireOuvert === "nouveau" ? null : formulaireOuvert} onFermer={() => setFormulaireOuvert(null)} />
      )}
    </div>
  );
}
