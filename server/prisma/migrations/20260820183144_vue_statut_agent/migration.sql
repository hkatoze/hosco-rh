-- Miroir SQL exact des règles de server/src/domain/statut.ts. Toute
-- modification de l'une doit être répercutée dans l'autre — voir le test
-- de comparaison (src/domain/statutVue.comparaison.test.ts) qui casse si
-- elles divergent.

CREATE OR REPLACE VIEW "AgentStatutCourant" AS
WITH applicables AS (
  SELECT *
  FROM "Mouvement"
  WHERE "dateEffet" <= CURRENT_DATE
),
definitifs AS (
  SELECT DISTINCT ON ("agentId") "agentId", "type" AS "typeDefinitif"
  FROM applicables
  WHERE "type" IN ('DEMISSION', 'LICENCIEMENT', 'RETRAITE', 'DECES')
  ORDER BY "agentId", "dateEffet" DESC, "createdAt" DESC
),
suspensions_ouvertes AS (
  SELECT DISTINCT s."agentId"
  FROM applicables s
  WHERE s."type" = 'SUSPENSION'
    AND NOT EXISTS (
      SELECT 1
      FROM applicables f
      WHERE f."agentId" = s."agentId"
        AND f."type" = 'FIN_SUSPENSION'
        AND (
          f."dateEffet" > s."dateEffet"
          OR (f."dateEffet" = s."dateEffet" AND f."createdAt" > s."createdAt")
        )
    )
),
conges_en_cours AS (
  SELECT DISTINCT "agentId"
  FROM applicables
  WHERE "type" = 'CONGE'
    AND "dateFin" IS NOT NULL
    AND "dateEffet" <= CURRENT_DATE
    AND CURRENT_DATE <= "dateFin"
),
dernier_mouvement AS (
  SELECT DISTINCT ON ("agentId") "agentId", "type" AS "dernierType", "dateEffet" AS "dernierDateEffet", "dateFin" AS "dernierDateFin"
  FROM applicables
  ORDER BY "agentId", "dateEffet" DESC, "createdAt" DESC
)
SELECT
  a."id" AS "agentId",
  CASE
    WHEN d."typeDefinitif" = 'DEMISSION' THEN 'DEMISSIONNE'
    WHEN d."typeDefinitif" = 'LICENCIEMENT' THEN 'LICENCIE'
    WHEN d."typeDefinitif" = 'RETRAITE' THEN 'RETRAITE'
    WHEN d."typeDefinitif" = 'DECES' THEN 'DECEDE'
    WHEN so."agentId" IS NOT NULL THEN 'SUSPENDU'
    WHEN cc."agentId" IS NOT NULL THEN 'EN_CONGE'
    WHEN dm."dernierType" = 'CONGE' AND dm."dernierDateFin" < CURRENT_DATE THEN 'CONGE_DEPASSE'
    ELSE 'PRESENT'
  END AS "statut",
  dm."dernierType" AS "dernierMouvementType",
  dm."dernierDateEffet" AS "dernierMouvementDateEffet",
  dm."dernierDateFin" AS "dernierMouvementDateFin"
FROM "Agent" a
LEFT JOIN definitifs d ON d."agentId" = a."id"
LEFT JOIN suspensions_ouvertes so ON so."agentId" = a."id"
LEFT JOIN conges_en_cours cc ON cc."agentId" = a."id"
LEFT JOIN dernier_mouvement dm ON dm."agentId" = a."id";
