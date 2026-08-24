import { useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { apiFetch, ErreurApi } from "../api/client";
import type { PageMouvements, ServiceAvecEffectif, TypeMouvement } from "../api/types";
import { TYPES_MOUVEMENT } from "../../../shared/mouvement";
import { LIBELLE_TYPE_MOUVEMENT } from "../lib/mouvement";
import { Champ } from "../components/Champ";
import { Selecteur } from "../components/Selecteur";
import { Bouton } from "../components/Bouton";
import { Alerte } from "../components/Alerte";
import { Cellule, CelluleEntete, EnteteTableau, LigneSquelette, LigneTableau, Tableau } from "../components/Tableau";

const TAILLE_PAGE_DEFAUT = 25;
const DELAI_RECHERCHE_MS = 300;

function construireQuery(params: URLSearchParams): string {
  const q = new URLSearchParams();
  for (const cle of ["q", "type", "serviceId", "dateDebut", "dateFin", "inclureAnnules", "page", "taille"]) {
    const valeur = params.get(cle);
    if (valeur) q.set(cle, valeur);
  }
  return q.toString();
}

function formaterDate(iso: string): string {
  return new Date(iso).toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

export function Mouvements() {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const refRecherche = useRef<HTMLInputElement>(null);

  const q = searchParams.get("q") ?? "";
  const type = searchParams.get("type") ?? "";
  const serviceId = searchParams.get("serviceId") ?? "";
  const dateDebut = searchParams.get("dateDebut") ?? "";
  const dateFin = searchParams.get("dateFin") ?? "";
  const inclureAnnules = searchParams.get("inclureAnnules") === "true";
  const page = Number(searchParams.get("page") ?? "1");
  const taille = Number(searchParams.get("taille") ?? String(TAILLE_PAGE_DEFAUT));

  const [rechercheLocale, setRechercheLocale] = useState(q);

  useEffect(() => {
    setRechercheLocale(q);
  }, [q]);

  useEffect(() => {
    const minuteur = setTimeout(() => {
      if (rechercheLocale === q) return;
      const suivant = new URLSearchParams(searchParams);
      if (rechercheLocale) suivant.set("q", rechercheLocale);
      else suivant.delete("q");
      suivant.set("page", "1");
      setSearchParams(suivant, { replace: true });
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, DELAI_RECHERCHE_MS);
    return () => clearTimeout(minuteur);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rechercheLocale]);

  function mettreAJourFiltre(cle: string, valeur: string) {
    const suivant = new URLSearchParams(searchParams);
    if (valeur) suivant.set(cle, valeur);
    else suivant.delete(cle);
    suivant.set("page", "1");
    setSearchParams(suivant, { replace: true });
  }

  function basculerInclureAnnules() {
    mettreAJourFiltre("inclureAnnules", inclureAnnules ? "" : "true");
  }

  function reinitialiserFiltres() {
    setSearchParams(new URLSearchParams(), { replace: true });
    setRechercheLocale("");
  }

  function changerPage(nouvellePage: number) {
    const suivant = new URLSearchParams(searchParams);
    suivant.set("page", String(nouvellePage));
    setSearchParams(suivant, { replace: true });
  }

  const requeteChaine = construireQuery(searchParams);
  const {
    data,
    isLoading,
    isPlaceholderData,
    isError,
    error,
    refetch,
  } = useQuery({
    queryKey: ["mouvements", requeteChaine],
    queryFn: () => apiFetch<PageMouvements>(`/api/mouvements?${requeteChaine}`),
    placeholderData: keepPreviousData,
  });

  const { data: services } = useQuery({
    queryKey: ["services"],
    queryFn: () => apiFetch<ServiceAvecEffectif[]>("/api/services"),
    staleTime: 5 * 60_000,
  });

  const filtresActifs = Boolean(q || type || serviceId || dateDebut || dateFin || inclureAnnules);
  const nombreColonnes = 7;
  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.taille)) : 1;

  return (
    <div className="flex flex-col">
      <div className="sticky -top-6 z-10 -mx-6 -mt-6 bg-fond-page px-6 pb-6 pt-6">
        <div>
          <h1 className="text-lg font-medium text-texte-fort">Mouvements</h1>
          <p className="text-sm text-texte-faible">Journal des mouvements de l'ensemble du personnel</p>
        </div>

        <div className="mt-6 flex flex-wrap items-end gap-4 border border-bordure bg-fond-carte p-4 shadow-carte">
          <div className="min-w-[16rem] flex-1">
            <Champ
              ref={refRecherche}
              id="recherche-mouvements"
              etiquette="Recherche par nom ou matricule"
              placeholder="Ex : Dupont, M1024…"
              value={rechercheLocale}
              onChange={(e) => setRechercheLocale(e.target.value)}
            />
          </div>
          <Selecteur
            id="filtre-type-mouvement"
            etiquette="Type"
            value={type}
            onChange={(e) => mettreAJourFiltre("type", e.target.value)}
            options={[
              { valeur: "", libelle: "Tous les types" },
              ...TYPES_MOUVEMENT.map((t: TypeMouvement) => ({ valeur: t, libelle: LIBELLE_TYPE_MOUVEMENT[t] })),
            ]}
          />
          <Selecteur
            id="filtre-service-mouvement"
            etiquette="Service"
            value={serviceId}
            onChange={(e) => mettreAJourFiltre("serviceId", e.target.value)}
            options={[{ valeur: "", libelle: "Tous les services" }, ...(services ?? []).map((s) => ({ valeur: s.id, libelle: s.nom }))]}
          />
          <Champ
            id="date-debut-mouvement"
            etiquette="Depuis le"
            type="date"
            value={dateDebut}
            onChange={(e) => mettreAJourFiltre("dateDebut", e.target.value)}
          />
          <Champ
            id="date-fin-mouvement"
            etiquette="Jusqu'au"
            type="date"
            value={dateFin}
            onChange={(e) => mettreAJourFiltre("dateFin", e.target.value)}
          />
          <label htmlFor="inclure-annules" className="flex items-center gap-2 pb-2.5 text-sm text-texte-fort">
            <input id="inclure-annules" type="checkbox" checked={inclureAnnules} onChange={basculerInclureAnnules} />
            inclure les mouvements annulés
          </label>
          {filtresActifs && (
            <Bouton variante="discret" onClick={reinitialiserFiltres}>
              Effacer
            </Bouton>
          )}
        </div>
      </div>

      <div className="mt-6 flex flex-col gap-6">
        {isError ? (
          <Alerte
            variante="erreur"
            titre={error instanceof ErreurApi && error.status === 0 ? "Serveur injoignable" : "Une erreur est survenue"}
            description={error instanceof ErreurApi ? error.message : "Impossible de charger les mouvements."}
            action={{ libelle: "Réessayer", onClick: () => refetch() }}
          />
        ) : (
          <>
            <Tableau>
              <EnteteTableau>
                <tr>
                  <CelluleEntete>Date</CelluleEntete>
                  <CelluleEntete>Type</CelluleEntete>
                  <CelluleEntete>Agent</CelluleEntete>
                  <CelluleEntete>Service</CelluleEntete>
                  <CelluleEntete>Période</CelluleEntete>
                  <CelluleEntete>Motif</CelluleEntete>
                  <CelluleEntete>Saisi par</CelluleEntete>
                </tr>
              </EnteteTableau>
              <tbody>
                {isLoading
                  ? Array.from({ length: taille || TAILLE_PAGE_DEFAUT }).map((_, i) => <LigneSquelette key={i} colonnes={nombreColonnes} />)
                  : data?.donnees.map((mouvement) => {
                      const annule = Boolean(mouvement.annuleLe);
                      return (
                        <LigneTableau key={mouvement.id} onClick={() => navigate(`/personnel/${mouvement.agent.id}`)}>
                          <Cellule>
                            <span className={annule ? "text-texte-faible line-through" : undefined} title={annule ? (mouvement.motifAnnulation ?? undefined) : undefined}>
                              {formaterDate(mouvement.dateEffet)}
                            </span>
                          </Cellule>
                          <Cellule>
                            <span className={annule ? "text-texte-faible line-through" : undefined}>{LIBELLE_TYPE_MOUVEMENT[mouvement.type]}</span>
                          </Cellule>
                          <Cellule>
                            {mouvement.agent.nom}, {mouvement.agent.prenom}
                            <span className="ml-2 text-xs text-texte-faible">{mouvement.agent.matricule}</span>
                          </Cellule>
                          <Cellule>{mouvement.service}</Cellule>
                          <Cellule>{mouvement.dateFin ? `${formaterDate(mouvement.dateEffet)} — ${formaterDate(mouvement.dateFin)}` : "—"}</Cellule>
                          <Cellule>{mouvement.motif ?? "—"}</Cellule>
                          <Cellule>{mouvement.saisiPar}</Cellule>
                        </LigneTableau>
                      );
                    })}
              </tbody>
            </Tableau>

            {!isLoading && data && data.donnees.length === 0 && (
              <Alerte
                titre="Aucun mouvement ne correspond à ces critères"
                description={filtresActifs ? "Essayez d'élargir la recherche ou les filtres actifs." : "Aucun mouvement enregistré."}
                action={filtresActifs ? { libelle: "Réinitialiser les filtres", onClick: reinitialiserFiltres } : undefined}
              />
            )}

            {data && data.total > 0 && (
              <div className="flex items-center justify-between text-sm text-texte-faible">
                <p>
                  Affichage {(page - 1) * taille + 1}-{Math.min(page * taille, data.total)} sur {data.total} mouvements
                </p>
                <div className="flex gap-2">
                  <Bouton variante="discret" disabled={page <= 1 || isPlaceholderData} onClick={() => changerPage(page - 1)}>
                    Précédent
                  </Bouton>
                  <Bouton variante="discret" disabled={page >= totalPages || isPlaceholderData} onClick={() => changerPage(page + 1)}>
                    Suivant
                  </Bouton>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
