-- Extension pour la recherche par similarité (trigrammes), utilisée par
-- la recherche "par nom ou matricule" de l'annuaire.
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS "Agent_nom_trgm_idx" ON "Agent" USING GIN ("nom" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "Agent_prenom_trgm_idx" ON "Agent" USING GIN ("prenom" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "Agent_matricule_trgm_idx" ON "Agent" USING GIN ("matricule" gin_trgm_ops);
