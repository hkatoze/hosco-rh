import { describe, expect, it } from "vitest";
import { prisma } from "../db";
import { dateDuJour, statutAgent } from "./statut";

/**
 * La vue SQL "AgentStatutCourant" (migration 20260820183144_vue_statut_agent)
 * doit être un miroir exact des règles de statut.ts. Ce test ne modifie
 * aucune donnée : il lit le jeu de données du seed tel quel et compare,
 * agent par agent, le statut renvoyé par la vue et celui calculé en
 * TypeScript. S'il casse, la vue et la fonction ont divergé.
 */
describe("Vue AgentStatutCourant vs statutAgent() TypeScript", () => {
  it("concorde pour tous les agents actuellement en base", async () => {
    const agents = await prisma.agent.findMany({
      select: {
        id: true,
        matricule: true,
        mouvements: { select: { type: true, dateEffet: true, dateFin: true, createdAt: true, annuleLe: true } },
      },
    });
    expect(agents.length).toBeGreaterThan(0);

    const vue = await prisma.$queryRaw<Array<{ agentId: string; statut: string }>>`
      SELECT "agentId", "statut" FROM "AgentStatutCourant"
    `;
    const statutParVue = new Map(vue.map((ligne) => [ligne.agentId, ligne.statut]));

    const aujourdhui = dateDuJour();
    const ecarts: string[] = [];

    for (const agent of agents) {
      const statutTs = statutAgent(agent.mouvements, aujourdhui);
      const statutSql = statutParVue.get(agent.id);
      if (statutSql !== statutTs) {
        ecarts.push(`${agent.matricule} (${agent.id}) : vue="${statutSql}" ts="${statutTs}"`);
      }
    }

    expect(ecarts, `Écarts vue/TypeScript :\n${ecarts.join("\n")}`).toEqual([]);
  });
});
