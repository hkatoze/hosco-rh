import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { CalendarClock, FileDown, Plus, TrendingDown, TrendingUp, UserMinus, UserPlus, Users } from "lucide-react";
import { apiFetch, ErreurApi } from "../api/client";
import type { MouvementListe, PageMouvements, TableauDeBordDonnees } from "../api/types";
import { useSession } from "../hooks/useSession";
import { roleSuffisant } from "../lib/roles";
import { LIBELLE_TYPE_MOUVEMENT } from "../lib/mouvement";
import { Bouton } from "../components/Bouton";
import { Alerte } from "../components/Alerte";

function formaterDate(iso: string): string {
  return new Date(iso).toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function Variation({ valeur, suffixe = "" }: { valeur: number; suffixe?: string }) {
  if (valeur === 0) return <span className="text-xs text-texte-faible">stable vs le mois précédent</span>;
  const positif = valeur > 0;
  return (
    <span className={`inline-flex items-center gap-1 text-xs ${positif ? "text-statut-vert" : "text-primaire"}`}>
      {positif ? <TrendingUp className="h-3 w-3" aria-hidden="true" /> : <TrendingDown className="h-3 w-3" aria-hidden="true" />}
      {positif ? "+" : ""}
      {valeur}
      {suffixe} vs le mois précédent
    </span>
  );
}

function CarteStat({
  icone: Icone,
  etiquette,
  valeur,
  info,
  enfant,
}: {
  icone: typeof Users;
  etiquette: string;
  valeur: string;
  info?: string;
  enfant?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3 border border-bordure bg-fond-carte p-4 shadow-carte" title={info}>
      <div className="flex items-center justify-between">
        <p className="text-xs text-texte-faible">{etiquette}</p>
        <Icone className="h-4 w-4 text-texte-faible" aria-hidden="true" />
      </div>
      <p className="text-2xl font-medium text-texte-fort">{valeur}</p>
      {enfant}
    </div>
  );
}

export function TableauDeBord() {
  const { data: utilisateur } = useSession();
  const peutAjouter = utilisateur ? roleSuffisant(utilisateur.role, "SAISIE") : false;

  const {
    data,
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery({
    queryKey: ["tableau-de-bord"],
    queryFn: () => apiFetch<TableauDeBordDonnees>("/api/tableau-de-bord"),
  });

  const { data: mouvementsRecents } = useQuery({
    queryKey: ["mouvements", "recents"],
    queryFn: () => apiFetch<PageMouvements>("/api/mouvements?taille=5"),
  });

  if (isError) {
    return (
      <Alerte
        variante="erreur"
        titre={error instanceof ErreurApi && error.status === 0 ? "Serveur injoignable" : "Une erreur est survenue"}
        description={error instanceof ErreurApi ? error.message : "Impossible de charger le tableau de bord."}
        action={{ libelle: "Réessayer", onClick: () => refetch() }}
      />
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-medium text-texte-fort">Aperçu global</h1>
          <p className="text-sm text-texte-faible">Résumé des indicateurs RH clés</p>
        </div>
        <div className="flex gap-3">
          <a href="/api/tableau-de-bord/rapport">
            <Bouton type="button" variante="secondaire">
              <FileDown className="h-4 w-4" aria-hidden="true" />
              Générer un rapport
            </Bouton>
          </a>
          {peutAjouter && (
            <Link to="/personnel/nouveau">
              <Bouton type="button" variante="primaire">
                <Plus className="h-4 w-4" aria-hidden="true" />
                Ajouter un employé
              </Bouton>
            </Link>
          )}
        </div>
      </div>

      {isLoading || !data ? (
        <p className="text-sm text-texte-faible">Chargement…</p>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <CarteStat
              icone={Users}
              etiquette="Personnel actif"
              valeur={String(data.totalPersonnel)}
              info="Agents actuellement en poste — exclut les démissions, licenciements, retraites et décès. L'annuaire du personnel, lui, liste tous les agents, y compris ceux ayant quitté l'établissement."
              enfant={<Variation valeur={data.totalPersonnelVariation} />}
            />
            <CarteStat
              icone={UserPlus}
              etiquette="Arrivées ce mois"
              valeur={String(data.arriveesMois)}
              enfant={<span className="text-xs text-texte-faible">vs {data.arriveesMoisPrecedent} le mois précédent</span>}
            />
            <CarteStat
              icone={UserMinus}
              etiquette="Départs ce mois"
              valeur={String(data.departsMois)}
              enfant={<Variation valeur={data.departsMois - data.departsMoisPrecedent} />}
            />
            <CarteStat
              icone={CalendarClock}
              etiquette="Taux d'absence"
              valeur={`${data.tauxAbsence}%`}
              enfant={<span className="text-xs text-texte-faible">Agents en congé ou suspendus, à ce jour</span>}
            />
          </div>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
            <div className="border border-bordure bg-fond-carte p-4 shadow-carte lg:col-span-2">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-sm font-medium text-texte-fort">Mouvements récents</h2>
                <Link to="/mouvements" className="text-sm text-primaire hover:underline">
                  Voir tout
                </Link>
              </div>
              {mouvementsRecents && mouvementsRecents.donnees.length > 0 ? (
                <ul className="flex flex-col divide-y divide-bordure">
                  {mouvementsRecents.donnees.map((mouvement: MouvementListe) => (
                    <li key={mouvement.id} className="flex items-center justify-between gap-3 py-3 text-sm">
                      <Link to={`/personnel/${mouvement.agent.id}`} className="min-w-0 flex-1 truncate text-texte-fort hover:underline">
                        {mouvement.agent.nom}, {mouvement.agent.prenom}
                      </Link>
                      <span className="w-40 shrink-0 text-texte-faible">{LIBELLE_TYPE_MOUVEMENT[mouvement.type]}</span>
                      <span className="w-32 shrink-0 text-texte-faible">{mouvement.service}</span>
                      <span className="w-24 shrink-0 text-right text-texte-faible">{formaterDate(mouvement.dateEffet)}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-texte-faible">Aucun mouvement enregistré.</p>
              )}
            </div>

            <div className="border border-bordure bg-fond-carte p-4 shadow-carte">
              <h2 className="mb-4 text-sm font-medium text-texte-fort">Répartition par service</h2>
              {data.repartitionParService.length > 0 ? (
                <ul className="flex flex-col gap-4">
                  {data.repartitionParService.map((service) => (
                    <li key={service.nom}>
                      <div className="mb-1 flex items-center justify-between text-sm">
                        <span className="text-texte-fort">{service.nom}</span>
                        <span className="text-texte-faible">{service.pourcentage}%</span>
                      </div>
                      <div className="h-1.5 w-full border border-bordure">
                        <div className="h-full bg-primaire" style={{ width: `${service.pourcentage}%` }} />
                      </div>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-texte-faible">Aucune donnée disponible.</p>
              )}
              <Link to="/personnel" className="mt-4 inline-block text-sm text-primaire hover:underline">
                Détails des effectifs
              </Link>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
