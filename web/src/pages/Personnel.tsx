import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { Download } from "lucide-react";
import { apiFetch, ErreurApi } from "../api/client";
import type { PageAgents, ServiceAvecEffectif, StatutAgent, TypeContrat } from "../api/types";
import { useSession } from "../hooks/useSession";
import { roleSuffisant } from "../lib/roles";
import { LIBELLE_STATUT, COULEUR_STATUT } from "../lib/statut";
import { Champ } from "../components/Champ";
import { Selecteur } from "../components/Selecteur";
import { Bouton } from "../components/Bouton";
import { Badge } from "../components/Badge";
import { Alerte } from "../components/Alerte";
import { Cellule, CelluleEntete, EnteteTableau, LigneSquelette, LigneTableau, Tableau } from "../components/Tableau";

const STATUTS: StatutAgent[] = [
  "PRESENT",
  "EN_CONGE",
  "CONGE_DEPASSE",
  "SUSPENDU",
  "DEMISSIONNE",
  "LICENCIE",
  "RETRAITE",
  "DECEDE",
];
const TYPES_CONTRAT: TypeContrat[] = ["CDI", "CDD", "STAGE", "VACATAIRE"];
const TAILLE_PAGE_DEFAUT = 25;
const DELAI_RECHERCHE_MS = 300;

function construireQuery(params: URLSearchParams): string {
  const q = new URLSearchParams();
  for (const cle of ["q", "serviceId", "statut", "typeContrat", "page", "taille", "tri"]) {
    const valeur = params.get(cle);
    if (valeur) q.set(cle, valeur);
  }
  return q.toString();
}

// Mêmes filtres que la liste, mais sans pagination ni tri : l'export porte
// sur la vue filtrée entière, pas seulement la page affichée à l'écran.
function construireQueryExport(params: URLSearchParams): string {
  const q = new URLSearchParams();
  for (const cle of ["q", "serviceId", "statut", "typeContrat"]) {
    const valeur = params.get(cle);
    if (valeur) q.set(cle, valeur);
  }
  return q.toString();
}

export function Personnel() {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const refRecherche = useRef<HTMLInputElement>(null);
  const { data: utilisateur } = useSession();
  const peutAjouter = utilisateur ? roleSuffisant(utilisateur.role, "SAISIE") : false;

  const q = searchParams.get("q") ?? "";
  const serviceId = searchParams.get("serviceId") ?? "";
  const statut = searchParams.get("statut") ?? "";
  const typeContrat = searchParams.get("typeContrat") ?? "";
  const page = Number(searchParams.get("page") ?? "1");
  const taille = Number(searchParams.get("taille") ?? String(TAILLE_PAGE_DEFAUT));
  const tri = searchParams.get("tri") ?? "nom";

  const [rechercheLocale, setRechercheLocale] = useState(q);

  // Focus automatique à l'ouverture, et raccourci "/" depuis n'importe où
  // sur l'écran pour y revenir.
  useEffect(() => {
    refRecherche.current?.focus();
  }, []);
  useEffect(() => {
    function surAppuiTouche(e: KeyboardEvent) {
      if (e.key !== "/") return;
      const cible = e.target as HTMLElement | null;
      const dansChamp = cible && ["INPUT", "TEXTAREA", "SELECT"].includes(cible.tagName);
      if (dansChamp) return;
      e.preventDefault();
      refRecherche.current?.focus();
    }
    document.addEventListener("keydown", surAppuiTouche);
    return () => document.removeEventListener("keydown", surAppuiTouche);
  }, []);

  // Synchronise l'URL -> champ local (retour arrière, lien copié-collé...).
  useEffect(() => {
    setRechercheLocale(q);
  }, [q]);

  // Synchronise champ local -> URL, avec un délai de 300 ms.
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

  function reinitialiserFiltres() {
    setSearchParams(new URLSearchParams(), { replace: true });
    setRechercheLocale("");
  }

  function changerTri(champ: "nom" | "matricule") {
    const suivant = new URLSearchParams(searchParams);
    const actuel = suivant.get("tri") ?? "nom";
    suivant.set("tri", actuel === champ ? `-${champ}` : champ);
    suivant.set("page", "1");
    setSearchParams(suivant, { replace: true });
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
    queryKey: ["agents", requeteChaine],
    queryFn: () => apiFetch<PageAgents>(`/api/agents?${requeteChaine}`),
    placeholderData: keepPreviousData,
  });

  const { data: services } = useQuery({
    queryKey: ["services"],
    queryFn: () => apiFetch<ServiceAvecEffectif[]>("/api/services"),
    staleTime: 5 * 60_000,
  });

  const filtresActifs = Boolean(q || serviceId || statut || typeContrat);
  const nombreColonnes = 5;
  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.taille)) : 1;

  return (
    <div className="flex flex-col">
      {/* Figé en haut de la zone de contenu au défilement : ne scrolle pas avec la liste. */}
      <div className="sticky -top-6 z-10 -mx-6 -mt-6 bg-fond-page px-6 pb-6 pt-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-lg font-medium text-texte-fort">Annuaire du personnel</h1>
            <p className="text-sm text-texte-faible">
              Gestion et consultation des dossiers employés
              {!isError && data && (
                <span className="text-texte-fort">
                  {" "}
                  · {data.total} {data.total > 1 ? "agents" : "agent"}
                  {filtresActifs ? (data.total > 1 ? " (filtrés)" : " (filtré)") : ""}
                </span>
              )}
            </p>
          </div>
          <div className="flex gap-3">
            <a href={`/api/agents/export?${construireQueryExport(searchParams)}`}>
              <Bouton type="button" variante="secondaire">
                <Download className="h-4 w-4" aria-hidden="true" />
                Exporter
              </Bouton>
            </a>
            {peutAjouter && (
              <Link to="/personnel/nouveau">
                <Bouton type="button" variante="primaire">
                  Ajouter un employé
                </Bouton>
              </Link>
            )}
          </div>
        </div>

        <div className="mt-6 flex flex-wrap items-end gap-4 border border-bordure bg-fond-carte p-4 shadow-carte">
          <div className="min-w-[16rem] flex-1">
            <Champ
              ref={refRecherche}
              id="recherche"
              etiquette="Recherche par nom ou matricule"
              placeholder="Ex : Dupont, M1024…"
              value={rechercheLocale}
              onChange={(e) => setRechercheLocale(e.target.value)}
            />
          </div>
          <Selecteur
            id="filtre-service"
            etiquette="Service"
            value={serviceId}
            onChange={(e) => mettreAJourFiltre("serviceId", e.target.value)}
            options={[{ valeur: "", libelle: "Tous les services" }, ...(services ?? []).map((s) => ({ valeur: s.id, libelle: s.nom }))]}
          />
          <Selecteur
            id="filtre-statut"
            etiquette="Statut"
            value={statut}
            onChange={(e) => mettreAJourFiltre("statut", e.target.value)}
            options={[{ valeur: "", libelle: "Tous les statuts" }, ...STATUTS.map((s) => ({ valeur: s, libelle: LIBELLE_STATUT[s] }))]}
          />
          <Selecteur
            id="filtre-type-contrat"
            etiquette="Type de contrat"
            value={typeContrat}
            onChange={(e) => mettreAJourFiltre("typeContrat", e.target.value)}
            options={[{ valeur: "", libelle: "Tous les contrats" }, ...TYPES_CONTRAT.map((t) => ({ valeur: t, libelle: t }))]}
          />
          {filtresActifs && (
            <Bouton variante="discret" onClick={reinitialiserFiltres}>
              Effacer
            </Bouton>
          )}
        </div>
      </div>

      <div className="mt-6 flex flex-col gap-6">
      {isError ? (
        error instanceof ErreurApi && error.status === 0 ? (
          <Alerte
            variante="erreur"
            titre="Serveur injoignable"
            description="Le serveur de l'hôpital ne répond pas. Vérifiez la connexion au réseau local et réessayez."
            action={{ libelle: "Réessayer", onClick: () => refetch() }}
          />
        ) : (
          <Alerte
            variante="erreur"
            titre="Une erreur est survenue"
            description={error instanceof ErreurApi ? error.message : "Impossible de charger la liste du personnel."}
            action={{ libelle: "Réessayer", onClick: () => refetch() }}
          />
        )
      ) : (
        <>
          <Tableau>
            <EnteteTableau>
              <tr>
                <CelluleEntete onClick={() => changerTri("nom")} triActif={tri === "nom" ? "asc" : tri === "-nom" ? "desc" : false}>
                  Agent
                </CelluleEntete>
                <CelluleEntete
                  onClick={() => changerTri("matricule")}
                  triActif={tri === "matricule" ? "asc" : tri === "-matricule" ? "desc" : false}
                >
                  Matricule
                </CelluleEntete>
                <CelluleEntete>Service</CelluleEntete>
                <CelluleEntete>Fonction</CelluleEntete>
                <CelluleEntete>Statut</CelluleEntete>
              </tr>
            </EnteteTableau>
            <tbody>
              {isLoading
                ? Array.from({ length: taille || TAILLE_PAGE_DEFAUT }).map((_, i) => <LigneSquelette key={i} colonnes={nombreColonnes} />)
                : data?.donnees.map((agent) => (
                    <LigneTableau key={agent.id} onClick={() => navigate(`/personnel/${agent.id}`)}>
                      <Cellule>
                        {agent.nom}, {agent.prenom}
                      </Cellule>
                      <Cellule>{agent.matricule}</Cellule>
                      <Cellule>{agent.service.nom}</Cellule>
                      <Cellule>{agent.fonction}</Cellule>
                      <Cellule>
                        <Badge couleur={COULEUR_STATUT[agent.statut]}>{LIBELLE_STATUT[agent.statut]}</Badge>
                      </Cellule>
                    </LigneTableau>
                  ))}
            </tbody>
          </Tableau>

          {!isLoading && data && data.donnees.length === 0 && (
            <Alerte
              titre="Aucun agent ne correspond à ces critères"
              description={filtresActifs ? "Essayez d'élargir la recherche ou les filtres actifs." : "Aucun agent enregistré."}
              action={filtresActifs ? { libelle: "Réinitialiser les filtres", onClick: reinitialiserFiltres } : undefined}
            />
          )}

          {data && data.total > 0 && (
            <div className="flex items-center justify-between text-sm text-texte-faible">
              <p>
                Affichage {(page - 1) * taille + 1}-{Math.min(page * taille, data.total)} sur {data.total} dossiers
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
