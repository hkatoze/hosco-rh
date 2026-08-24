# ZAKA RH — Logiciel de suivi du personnel

## Contexte
Application web interne pour le service RH de l'Hôpital Saint Camille
(HOSCO, Ouagadougou). "HOSCO" désigne l'hôpital client ; "ZAKA RH" est
le nom du logiciel, affiché dans l'interface (écran de connexion,
barre supérieure) — les deux ne sont pas interchangeables.
Environ 300 agents, 5 utilisateurs RH simultanés max.
Hébergée sur un serveur local de l'hôpital, accessible depuis les
navigateurs des postes du service RH via le réseau local.
Pas d'accès internet garanti sur le serveur.

## Objectif fonctionnel
Retrouver un agent en tapant son nom et voir en un écran : ses
informations, son statut actuel, ses documents scannés.
Filtrer des listes d'agents et les exporter en Excel.

## Stack imposé
- Frontend : React 18 + Vite + TypeScript + Tailwind CSS
- TanStack Query (données), TanStack Table (listes), React Hook Form + Zod (formulaires)
- Backend : Hono + TypeScript + Prisma
- Base : PostgreSQL 16
- Déploiement : Docker Compose (app, postgres, caddy)
- Le backend sert aussi le build statique du front. Une seule origine, pas de CORS.

## Décisions d'architecture — ne pas les remettre en question
- Authentification par **session en cookie httpOnly**, pas de JWT.
  Réseau local, un seul backend, révocation immédiate nécessaire.
- Les fichiers sont stockés **sur le disque**, jamais en base.
  Un dossier par agent, nom de fichier en UUID, chemin en base.
  Le dossier est hors de la racine web : les fichiers sont servis par
  un endpoint qui vérifie la session et les droits.
- Le statut d'un agent est **dérivé de la table `mouvement`**, jamais
  saisi directement. Seule la fonction `statutAgent()`
  (`server/src/domain/statut.ts`) a le droit de calculer ce statut —
  aucune autre partie du code (API, front) ne doit réimplémenter cette
  logique. Statuts possibles : `PRESENT`, `EN_CONGE`, `CONGE_DEPASSE`,
  `SUSPENDU`, `DEMISSIONNE`, `LICENCIE`, `RETRAITE`, `DECEDE`.
  - `CONGE_DEPASSE` : un congé dont la `dateFin` est dépassée sans
    mouvement postérieur n'est pas considéré comme un retour implicite
    à l'état présent — c'est une anomalie de saisie à signaler
    (voir `GET /api/anomalies`), pas un statut normal.
  - La vue SQL Postgres `AgentStatutCourant` (créée en migration manuelle)
    est un **miroir exact** de ces règles, utilisée pour filtrer/trier
    par statut en SQL sans le recalculer ligne à ligne côté application.
    Toute modification des règles dans `statut.ts` doit être répercutée
    dans la vue — un test compare les deux sur l'ensemble des agents et
    casse en cas de divergence.
- Règles de mouvement :
  - `CONGE` : `dateFin` obligatoire à la saisie. Il n'existe pas de
    mouvement de retour — l'agent redevient actif de lui-même à
    l'échéance (pas de `RETOUR_CONGE`).
  - `SUSPENSION` : `dateFin` est indicative seulement, elle ne lève
    jamais la suspension automatiquement. Seul un mouvement explicite
    `FIN_SUSPENSION` y met fin.
- Recherche d'agents (nom/prénom) insensible à la casse **et aux
  accents** : `pg_trgm` seul ne gère pas les accents, `unaccent()`
  n'est pas `IMMUTABLE` donc inutilisable dans un index. La recherche
  passe par une fonction wrapper `f_unaccent()` (IMMUTABLE), indexée en
  GIN trigram, et interrogée via `$queryRaw` avec paramètres liés
  (jamais de concaténation de chaîne — Prisma ne sait pas exprimer ce
  genre de requête nativement).
- **Piège de migration, systématique** : ce projet a des objets créés en
  SQL brut (index trigram/unaccent, fonction `f_unaccent`, vue
  `AgentStatutCourant`) que `schema.prisma` ne déclare jamais. **Toute**
  commande qui génère une migration en comparant à `schema.prisma`
  (`migrate dev`, `migrate diff --from-url` comme `--from-migrations`
  avec shadow database) traite ces objets comme une dérive et propose de
  les supprimer — que la comparaison se fasse contre la base réelle ou
  contre une shadow database rejouée depuis l'historique, le résultat
  est le même, puisque la référence finale est toujours `schema.prisma`.
  C'est arrivé deux fois (migrations `20260820211717_restaure_index_matricule`
  et `20260820213434_documents_corbeille`). **Toujours** relire le SQL
  généré avant `migrate dev`/`migrate deploy` et retirer à la main tout
  `DROP INDEX` / `DROP FUNCTION` / `DROP VIEW` visant un objet
  intentionnellement géré hors schéma.
- Documents et photos, stockage sur disque (tâche 4) :
  - Racine configurable via `DOCUMENTS_RACINE` (`server/src/config.ts`),
    hors de la racine web, jamais servie statiquement (à vérifier dans le
    Caddyfile — inexistant à ce jour, Caddy n'a pas encore été mis en place).
  - Arborescence `{RACINE}/{annee_depot}/{agentId ou agents-photos/agentId}/{uuid}.{ext}`,
    corbeille `{RACINE}/_corbeille/{annee_suppression}/{uuid}.{ext}`.
  - Type de fichier déterminé par les octets d'en-tête (magic bytes)
    uniquement — jamais l'extension ni le Content-Type du client
    (`server/src/domain/documents/typeFichier.ts`).
  - Écriture en flux réel (busboy + Node streams), plafond 10 Mo appliqué
    pendant le flux, images réencodées avec sharp (retire l'EXIF/GPS,
    jamais de `.withMetadata()`) — voir `server/src/storage/ecritureFlux.ts`.
  - **Piège busboy, systématique** : quand un fichier est rejeté en cours
    de flux (type invalide, taille dépassée...), il faut drainer le
    `fileStream` de busboy jusqu'au bout AVANT de laisser l'erreur se
    propager — sinon busboy n'émet jamais `close` et la requête reste
    bloquée indéfiniment. Le drainage doit passer par le **même**
    mécanisme de lecture que celui utilisé pour lire le flux (ici,
    l'itérateur asynchrone `flux[Symbol.asyncIterator]()`) : appeler
    `fileStream.resume()` depuis l'extérieur après avoir déjà consommé le
    flux via son itérateur asynchrone provoque un deadlock silencieux
    (observé uniquement avec un corps `multipart/form-data` généré par
    `undici`/`FormData`, pas avec un flux Node classique — donc invisible
    en test unitaire isolé, seulement en test d'intégration HTTP réel).
    Voir `ecrireFichierEnFlux` (`drainerRestant`) et les commentaires dans
    `documents.ts`/`agentPhoto.ts`.
  - Suppression douce : le fichier part en corbeille, la ligne `Document`
    reste avec `supprimeLe`/`supprimeParId`. Aucune route ne supprime
    réellement un fichier ni une ligne.
- Pas de Supabase, pas de Firebase, pas de service externe.
- Tout le texte de l'interface est en **français**.

## Conventions
- TypeScript strict, pas de `any`.
- Validation Zod sur **toutes** les entrées de l'API, côté serveur.
  Ne jamais faire confiance au front.
- Les erreurs API renvoient `{ error: string }` avec le bon code HTTP.
- Pas de commentaires décoratifs. Commenter seulement le non-évident.
- Messages de commit en français, format conventionnel.

## Sécurité — non négociable
- Comptes nominatifs. Trois rôles : `LECTURE`, `SAISIE`, `ADMIN`.
- Mots de passe hachés avec argon2.
- Table `journal` : chaque consultation de fiche, chaque export,
  chaque modification est enregistrée (utilisateur, action, cible, date).
- Les uploads sont limités : PDF, JPG, PNG uniquement, 10 Mo max,
  type MIME vérifié côté serveur (pas seulement l'extension).

## Style visuel
Voir les maquettes fournies (captures d'écran du 2026-08-20, non
présentes dans ce dépôt — à redemander si besoin de les revoir).

Thème sombre sur l'ensemble du logiciel, pas seulement l'écran de
connexion (décision du 2026-08-21 : l'exception initialement limitée à
`/connexion` a été généralisée à toute l'application sur demande
explicite — même palette, même branding partout). Le thème clair
d'origine (2026-08-20) a été abandonné, pas gardé en option.

Règles strictes :
- `border-radius: 0` partout. Aucun angle arrondi.
- Bordures 1px visibles sur tous les éléments interactifs.
- Boutons en outline, fond transparent, bordure et texte colorés —
  jamais d'ombre sur un bouton (seuls les panneaux/cartes en ont une,
  voir ci-dessous).
- Pas de dégradés CSS. En revanche, les surfaces `fond-carte`
  (panneaux, tableaux, modales, cartes d'authentification) portent une
  vraie ombre portée (`shadow-carte`, ou `shadow-connexion` pour les
  écrans de connexion/changement de mot de passe — effet plus marqué).
- Couleur principale : #A32D2D (inchangée). Fond de page #241E17, fond
  de carte #332A20. Texte #F7F3EC (fort) / #C6B9A8 (faible). Bordures
  #4E4030.
- Statuts (éclaircis par rapport à la palette claire d'origine pour
  rester lisibles sur fond sombre) : vert #7FBF3E, ambre #E0A339,
  gris #A79C8E, rouge #A32D2D.
- Police Inter, deux graisses seulement : 400 et 500.
- Toutes les couleurs et ombres dans un seul fichier de tokens
  Tailwind (`web/tailwind.config.ts`), changeables en un endroit —
  aucune couleur en dur dans un composant.
- Libellés en casse de phrase (majuscule initiale, reste en
  minuscules sauf noms propres) — décision du 2026-08-21, revient sur
  le tout-minuscule initial des maquettes du 2026-08-20. Pas de
  MAJUSCULES ni de Title Case Mot À Mot.

### Écrans des maquettes
- Tableau de bord : indicateurs clés (total personnel, arrivées du
  mois, départs, taux d'absence), mouvements récents, répartition
  par pôle.
- Annuaire du personnel (deux variantes de liste) : recherche par nom
  ou matricule, filtres par service et statut, tableau paginé avec
  matricule / nom / service / poste / statut / date d'embauche /
  actions, export Excel.
- Fiche employé / fiche agent : identité, contact, statut, service,
  type de contrat, ancienneté, onglets (informations personnelles,
  contrat, carrière, documents), documents scannés téléchargeables,
  historique des mouvements avec pièces justificatives.
- Gestion des services : cartes par département (chef de service,
  effectif, taux d'occupation ou statut opérationnel).
- Nouvel agent : formulaire de création (identité, situation
  administrative, dépôt de documents par glisser-déposer).
- Connexion : écran de login sobre (identifiant / mot de passe).

## Ce qui n'est PAS dans le périmètre
Paie, génération d'attestations officielles, workflow de validation
des congés, pointage, évaluations, formations. Si une tâche dérive
vers ça, s'arrêter et le signaler.
