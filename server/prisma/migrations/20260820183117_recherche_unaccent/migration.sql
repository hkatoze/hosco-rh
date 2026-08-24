-- Recherche insensible à la casse ET aux accents (ex: "OUEDRAOGO" doit
-- matcher "Ouédraogo"). pg_trgm seul ne gère pas les accents ; unaccent()
-- n'est pas IMMUTABLE par défaut donc inutilisable tel quel dans un index.
-- f_unaccent() ci-dessous est un wrapper IMMUTABLE STRICT autour de
-- unaccent(), ce qui permet de l'indexer.

CREATE EXTENSION IF NOT EXISTS unaccent;

CREATE OR REPLACE FUNCTION f_unaccent(text) RETURNS text
  LANGUAGE sql IMMUTABLE PARALLEL SAFE STRICT AS
  $$ SELECT public.unaccent('public.unaccent', $1) $$;

-- Les index trigram simples sur nom/prenom (migration recherche_trigram,
-- tâche 1) ne sont plus utilisables par la recherche : toute requête doit
-- désormais passer par f_unaccent() des deux côtés, donc l'index doit
-- porter sur f_unaccent(colonne), pas sur la colonne brute.
DROP INDEX IF EXISTS "Agent_nom_trgm_idx";
DROP INDEX IF EXISTS "Agent_prenom_trgm_idx";

CREATE INDEX "Agent_nom_unaccent_trgm_idx" ON "Agent" USING GIN (f_unaccent("nom") gin_trgm_ops);
CREATE INDEX "Agent_prenom_unaccent_trgm_idx" ON "Agent" USING GIN (f_unaccent("prenom") gin_trgm_ops);

-- Le matricule (ex: "M-2021-001") ne contient jamais d'accent : l'index
-- trigram simple créé en tâche 1 (Agent_matricule_trgm_idx) reste tel quel.
