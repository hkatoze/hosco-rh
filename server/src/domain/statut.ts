import type { TypeMouvement } from "@prisma/client";

export type StatutAgent =
  | "PRESENT"
  | "EN_CONGE"
  | "CONGE_DEPASSE"
  | "SUSPENDU"
  | "DEMISSIONNE"
  | "LICENCIE"
  | "RETRAITE"
  | "DECEDE";

export interface MouvementPourStatut {
  type: TypeMouvement;
  dateEffet: Date;
  dateFin: Date | null;
  createdAt: Date;
  annuleLe: Date | null;
}

/**
 * Date du jour tronquée à minuit UTC — même granularité que les colonnes
 * `@db.Date` (dateEffet/dateFin) et que CURRENT_DATE côté SQL (vue
 * AgentStatutCourant). À utiliser comme dateReference pour "aujourd'hui" :
 * passer `new Date()` telle quelle décale les cas limites au dernier jour
 * d'un mouvement (EN_CONGE deviendrait CONGE_DEPASSE selon l'heure).
 */
export function dateDuJour(reference: Date = new Date()): Date {
  return new Date(Date.UTC(reference.getUTCFullYear(), reference.getUTCMonth(), reference.getUTCDate()));
}

const STATUT_DEFINITIF: Partial<Record<TypeMouvement, StatutAgent>> = {
  DEMISSION: "DEMISSIONNE",
  LICENCIEMENT: "LICENCIE",
  RETRAITE: "RETRAITE",
  DECES: "DECEDE",
};

function estPosterieur(a: MouvementPourStatut, reference: MouvementPourStatut): boolean {
  if (a.dateEffet.getTime() !== reference.dateEffet.getTime()) {
    return a.dateEffet.getTime() > reference.dateEffet.getTime();
  }
  return a.createdAt.getTime() > reference.createdAt.getTime();
}

function trierParRecence(mouvements: readonly MouvementPourStatut[]): MouvementPourStatut[] {
  return [...mouvements].sort((a, b) => {
    const diff = b.dateEffet.getTime() - a.dateEffet.getTime();
    if (diff !== 0) return diff;
    return b.createdAt.getTime() - a.createdAt.getTime();
  });
}

/**
 * Seule source du statut d'un agent dans l'application (voir CLAUDE.md).
 * La vue SQL "AgentStatutCourant" doit rester l'exact miroir de ces règles
 * (voir le test de comparaison vue/fonction).
 *
 * Règles appliquées dans cet ordre :
 *  1. Un mouvement définitif (DEMISSION, LICENCIEMENT, RETRAITE, DECES)
 *     applicable l'emporte sur tout le reste, quelle que soit sa position
 *     chronologique parmi les autres mouvements.
 *  2. Une SUSPENSION sans FIN_SUSPENSION postérieure -> SUSPENDU.
 *  3. Un CONGE dont l'intervalle [dateEffet, dateFin] couvre la date de
 *     référence -> EN_CONGE.
 *  4. Le dernier mouvement applicable est un CONGE dont la dateFin est
 *     dépassée, sans mouvement postérieur -> CONGE_DEPASSE (anomalie de
 *     saisie : l'agent est probablement revenu mais personne ne l'a noté).
 *  5. Sinon -> PRESENT.
 *
 * Un mouvement annulé (annuleLe non nul) est ignoré, comme s'il n'existait
 * pas — voir la vue SQL AgentStatutCourant, qui applique le même filtre.
 */
export function statutAgent(mouvements: readonly MouvementPourStatut[], dateReference: Date): StatutAgent {
  const applicables = mouvements
    .filter((m) => m.annuleLe === null)
    .filter((m) => m.dateEffet.getTime() <= dateReference.getTime());

  const definitifs = applicables.filter((m) => m.type in STATUT_DEFINITIF);
  if (definitifs.length > 0) {
    const dernierDefinitif = trierParRecence(definitifs)[0]!;
    return STATUT_DEFINITIF[dernierDefinitif.type]!;
  }

  const suspensionOuverte = applicables
    .filter((m) => m.type === "SUSPENSION")
    .some(
      (suspension) =>
        !applicables.some((m) => m.type === "FIN_SUSPENSION" && estPosterieur(m, suspension)),
    );
  if (suspensionOuverte) {
    return "SUSPENDU";
  }

  const congeEnCours = applicables.find(
    (m) =>
      m.type === "CONGE" &&
      m.dateFin !== null &&
      m.dateEffet.getTime() <= dateReference.getTime() &&
      dateReference.getTime() <= m.dateFin.getTime(),
  );
  if (congeEnCours) {
    return "EN_CONGE";
  }

  const dernier = trierParRecence(applicables)[0];
  if (dernier && dernier.type === "CONGE" && dernier.dateFin !== null && dernier.dateFin.getTime() < dateReference.getTime()) {
    return "CONGE_DEPASSE";
  }

  return "PRESENT";
}
