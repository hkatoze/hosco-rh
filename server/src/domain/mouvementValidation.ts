import type { TypeMouvement } from "@prisma/client";
import { dateDuJour, statutAgent, type MouvementPourStatut, type StatutAgent } from "./statut";

export interface NouveauMouvement {
  type: TypeMouvement;
  dateEffet: Date;
  dateFin: Date | null;
  motif?: string | null;
}

export interface ErreurValidationMouvement {
  /** Nom du champ du formulaire concerné, ou null si le refus ne cible aucun champ précis (état global de l'agent). */
  champ: string | null;
  message: string;
}

const STATUTS_DEFINITIFS: ReadonlySet<StatutAgent> = new Set(["DEMISSIONNE", "LICENCIE", "RETRAITE", "DECEDE"]);
const TYPES_DEFINITIFS: ReadonlySet<TypeMouvement> = new Set(["DEMISSION", "LICENCIEMENT", "RETRAITE", "DECES"]);

/**
 * Règles de refus d'un nouveau mouvement, dans l'ordre demandé. Retourne
 * l'erreur (champ concerné + message, à renvoyer en 422 — voir CLAUDE.md,
 * tâche 6 : "les refus 422 du serveur s'affichent sous le champ en cause")
 * ou null si le mouvement est valide. Le statut courant est recalculé via
 * statutAgent() — aucune duplication de règle de statut ici.
 */
export function validerNouveauMouvement(
  mouvementsExistants: readonly MouvementPourStatut[],
  nouveau: NouveauMouvement,
  dateRecrutement: Date,
): ErreurValidationMouvement | null {
  if (nouveau.dateEffet.getTime() < dateRecrutement.getTime()) {
    return { champ: "dateEffet", message: "La date d'effet ne peut pas être antérieure à la date de recrutement de l'agent." };
  }

  const statutActuel = statutAgent(mouvementsExistants, dateDuJour());

  if (STATUTS_DEFINITIFS.has(statutActuel)) {
    return {
      champ: null,
      message: "Cet agent est dans un état définitif (démission, licenciement, retraite ou décès) : aucun nouveau mouvement ne peut être ajouté.",
    };
  }

  if (nouveau.type === "CONGE" && statutActuel === "EN_CONGE") {
    return { champ: "type", message: "Un congé est déjà en cours pour cet agent." };
  }

  if (nouveau.type === "SUSPENSION" && statutActuel === "SUSPENDU") {
    return { champ: "type", message: "Une suspension est déjà en cours pour cet agent." };
  }

  if (nouveau.type === "FIN_SUSPENSION" && statutActuel !== "SUSPENDU") {
    return { champ: "type", message: "Aucune suspension en cours pour cet agent : impossible d'enregistrer une fin de suspension." };
  }

  if (nouveau.type === "CONGE" && nouveau.dateFin === null) {
    return { champ: "dateFin", message: "Un congé doit obligatoirement avoir une date de fin." };
  }

  if (TYPES_DEFINITIFS.has(nouveau.type) && !nouveau.motif) {
    return { champ: "motif", message: "Le motif est obligatoire pour ce type de mouvement." };
  }

  return null;
}
