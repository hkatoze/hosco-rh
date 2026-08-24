import { Hono } from "hono";
import { prisma } from "../../db";
import type { VariablesHono } from "../context";
import { exigeAuth, exigeRole, gardeChangementMotDePasse } from "../middlewares/auth";

export const routesAnomalies = new Hono<{ Variables: VariablesHono }>();

interface LigneAnomalie {
  id: string;
  matricule: string;
  nom: string;
  prenom: string;
  serviceNom: string;
  dateFinConge: Date;
  joursDepassement: number;
}

routesAnomalies.get("/", exigeAuth(), exigeRole("LECTURE"), gardeChangementMotDePasse(), async (c) => {
  const lignes = await prisma.$queryRaw<LigneAnomalie[]>`
    SELECT
      a."id", a."matricule", a."nom", a."prenom",
      s."nom" AS "serviceNom",
      st."dernierMouvementDateFin" AS "dateFinConge",
      (CURRENT_DATE - st."dernierMouvementDateFin") AS "joursDepassement"
    FROM "AgentStatutCourant" st
    JOIN "Agent" a ON a."id" = st."agentId"
    JOIN "Service" s ON s."id" = a."serviceId"
    WHERE st."statut" = 'CONGE_DEPASSE' AND a."supprimeLe" IS NULL
    ORDER BY "joursDepassement" DESC
  `;

  return c.json(
    lignes.map((l) => ({
      id: l.id,
      matricule: l.matricule,
      nom: l.nom,
      prenom: l.prenom,
      service: l.serviceNom,
      dateFinConge: l.dateFinConge,
      joursDepassement: Number(l.joursDepassement),
    })),
  );
});
