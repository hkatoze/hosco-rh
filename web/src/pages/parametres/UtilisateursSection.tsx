import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { apiFetch, ErreurApi } from "../../api/client";
import type { RoleUtilisateur, UtilisateurAdmin, UtilisateurCree } from "../../api/types";
import { useSession } from "../../hooks/useSession";
import { Bouton } from "../../components/Bouton";
import { Champ } from "../../components/Champ";
import { Selecteur } from "../../components/Selecteur";
import { Badge } from "../../components/Badge";
import { Modale } from "../../components/Modale";
import { Alerte } from "../../components/Alerte";
import { Cellule, CelluleEntete, EnteteTableau, LigneTableau, Tableau } from "../../components/Tableau";

const ROLES: RoleUtilisateur[] = ["LECTURE", "SAISIE", "ADMIN"];

function formaterDate(iso: string | null): string {
  return iso ? new Date(iso).toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric" }) : "jamais connecté";
}

function EncartMotDePasseTemporaire({ identifiant, motDePasse }: { identifiant: string; motDePasse: string }) {
  return (
    <div className="border border-primaire bg-primaire/10 px-3 py-3 text-sm text-texte-fort">
      <p>
        Mot de passe temporaire pour <strong>{identifiant}</strong> :
      </p>
      <p className="mt-1 font-mono text-base text-primaire">{motDePasse}</p>
      <p className="mt-2 text-xs text-texte-faible">
        Communiquez-le à l'utilisateur de vive voix ou par un canal sûr — il ne sera plus jamais affiché. Un changement de mot de passe sera exigé à la
        prochaine connexion.
      </p>
    </div>
  );
}

function FormulaireUtilisateur({ utilisateur, onFermer }: { utilisateur: UtilisateurAdmin | null; onFermer: () => void }) {
  const queryClient = useQueryClient();
  const [identifiant, setIdentifiant] = useState(utilisateur?.identifiant ?? "");
  const [nom, setNom] = useState(utilisateur?.nom ?? "");
  const [role, setRole] = useState<RoleUtilisateur>(utilisateur?.role ?? "LECTURE");
  const [resultatCreation, setResultatCreation] = useState<UtilisateurCree | null>(null);

  const enregistrement = useMutation({
    mutationFn: () =>
      utilisateur
        ? apiFetch<UtilisateurAdmin>(`/api/utilisateurs/${utilisateur.id}`, { method: "PATCH", body: JSON.stringify({ nom, role }) })
        : apiFetch<UtilisateurCree>("/api/utilisateurs", { method: "POST", body: JSON.stringify({ identifiant, nom, role }) }),
    onSuccess: async (resultat) => {
      await queryClient.invalidateQueries({ queryKey: ["utilisateurs"] });
      if (!utilisateur) setResultatCreation(resultat as UtilisateurCree);
      else onFermer();
    },
  });

  return (
    <Modale ouverte titre={utilisateur ? "Modifier l'utilisateur" : "Ajouter un utilisateur"} onFermer={onFermer}>
      {resultatCreation ? (
        <div className="flex flex-col gap-4">
          <EncartMotDePasseTemporaire identifiant={resultatCreation.identifiant} motDePasse={resultatCreation.motDePasseTemporaire} />
          <div className="flex justify-end">
            <Bouton type="button" variante="primaire" onClick={onFermer}>
              fermer
            </Bouton>
          </div>
        </div>
      ) : (
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            enregistrement.mutate();
          }}
        >
          <Champ
            id="utilisateur-identifiant"
            etiquette="Identifiant"
            required
            readOnly={Boolean(utilisateur)}
            disabled={Boolean(utilisateur)}
            value={identifiant}
            onChange={(e) => setIdentifiant(e.target.value)}
          />
          <Champ id="utilisateur-nom" etiquette="Nom complet" required value={nom} onChange={(e) => setNom(e.target.value)} />
          <Selecteur
            id="utilisateur-role"
            etiquette="Rôle"
            value={role}
            onChange={(e) => setRole(e.target.value as RoleUtilisateur)}
            options={ROLES.map((r) => ({ valeur: r, libelle: r }))}
          />

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
      )}
    </Modale>
  );
}

export function UtilisateursSection() {
  const { data: moi } = useSession();
  const queryClient = useQueryClient();
  const [formulaireOuvert, setFormulaireOuvert] = useState<"nouveau" | UtilisateurAdmin | null>(null);
  const [motDePasseReinitialise, setMotDePasseReinitialise] = useState<{ identifiant: string; motDePasse: string } | null>(null);

  const { data: utilisateurs, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["utilisateurs"],
    queryFn: () => apiFetch<UtilisateurAdmin[]>("/api/utilisateurs"),
  });

  const bascule = useMutation({
    mutationFn: (u: UtilisateurAdmin) => apiFetch(`/api/utilisateurs/${u.id}`, { method: "PATCH", body: JSON.stringify({ actif: !u.actif }) }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["utilisateurs"] }),
    onError: (e) => window.alert(e instanceof ErreurApi ? e.message : "Échec de l'opération."),
  });

  const reinitialisation = useMutation({
    mutationFn: (u: UtilisateurAdmin) => apiFetch<{ motDePasseTemporaire: string }>(`/api/utilisateurs/${u.id}/reinitialiser-mot-de-passe`, { method: "POST" }),
    onSuccess: (resultat, u) => setMotDePasseReinitialise({ identifiant: u.identifiant, motDePasse: resultat.motDePasseTemporaire }),
  });

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-texte-faible">Un compte désactivé ne peut plus se connecter.</p>
        <Bouton type="button" variante="primaire" onClick={() => setFormulaireOuvert("nouveau")}>
          <Plus className="h-4 w-4" aria-hidden="true" />
          ajouter un utilisateur
        </Bouton>
      </div>

      {isError ? (
        <Alerte
          variante="erreur"
          titre="Impossible de charger les utilisateurs"
          description={error instanceof ErreurApi ? error.message : undefined}
          action={{ libelle: "réessayer", onClick: () => refetch() }}
        />
      ) : (
        <Tableau>
          <EnteteTableau>
            <tr>
              <CelluleEntete>Identifiant</CelluleEntete>
              <CelluleEntete>Nom</CelluleEntete>
              <CelluleEntete>Rôle</CelluleEntete>
              <CelluleEntete>Dernier accès</CelluleEntete>
              <CelluleEntete>Statut</CelluleEntete>
              <CelluleEntete>Actions</CelluleEntete>
            </tr>
          </EnteteTableau>
          <tbody>
            {!isLoading &&
              utilisateurs?.map((u) => (
                <LigneTableau key={u.id}>
                  <Cellule>{u.identifiant}</Cellule>
                  <Cellule>{u.nom}</Cellule>
                  <Cellule>{u.role}</Cellule>
                  <Cellule>{formaterDate(u.dernierAcces)}</Cellule>
                  <Cellule>
                    <Badge couleur={u.actif ? "vert" : "gris"}>{u.actif ? "actif" : "inactif"}</Badge>
                  </Cellule>
                  <Cellule>
                    <div className="flex flex-wrap gap-2">
                      <Bouton type="button" variante="discret" onClick={() => setFormulaireOuvert(u)}>
                        modifier
                      </Bouton>
                      <Bouton
                        type="button"
                        variante="discret"
                        disabled={reinitialisation.isPending}
                        onClick={() => {
                          if (window.confirm(`Réinitialiser le mot de passe de ${u.identifiant} ?`)) reinitialisation.mutate(u);
                        }}
                      >
                        réinitialiser mdp
                      </Bouton>
                      {u.id !== moi?.id && (
                        <Bouton type="button" variante="discret" disabled={bascule.isPending} onClick={() => bascule.mutate(u)}>
                          {u.actif ? "désactiver" : "activer"}
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
        <FormulaireUtilisateur utilisateur={formulaireOuvert === "nouveau" ? null : formulaireOuvert} onFermer={() => setFormulaireOuvert(null)} />
      )}

      {motDePasseReinitialise && (
        <Modale ouverte titre="Mot de passe réinitialisé" onFermer={() => setMotDePasseReinitialise(null)}>
          <div className="flex flex-col gap-4">
            <EncartMotDePasseTemporaire identifiant={motDePasseReinitialise.identifiant} motDePasse={motDePasseReinitialise.motDePasse} />
            <div className="flex justify-end">
              <Bouton type="button" variante="primaire" onClick={() => setMotDePasseReinitialise(null)}>
                fermer
              </Bouton>
            </div>
          </div>
        </Modale>
      )}
    </div>
  );
}
