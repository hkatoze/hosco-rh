-- Correctif : la migration 20260820174554_auth_session a été générée via
-- `prisma migrate diff --from-url` (comparaison à l'état réel de la base)
-- plutôt que `--from-migrations`. N'ayant aucune existence dans
-- schema.prisma, les trois index trigram créés en SQL brut (tâche 1) ont
-- été traités comme une dérive et supprimés silencieusement
-- (Agent_matricule_trgm_idx, Agent_nom_trgm_idx, Agent_prenom_trgm_idx).
--
-- Les index sur nom/prenom ont depuis été recréés intentionnellement sous
-- une autre forme par la migration 20260820183117_recherche_unaccent
-- (f_unaccent(...)). L'index sur matricule, lui, n'avait pas été retouché
-- par cette migration ultérieure et n'a donc jamais été restauré — jusqu'à
-- ce que EXPLAIN ANALYZE le révèle absent. On le recrée ici à l'identique.

CREATE INDEX IF NOT EXISTS "Agent_matricule_trgm_idx" ON "Agent" USING GIN ("matricule" gin_trgm_ops);
