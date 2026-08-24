import type { StatutAgent } from "../api/types";

// Couleurs reprises de CLAUDE.md (fichier de tokens Tailwind) : vert, ambre,
// gris, rouge. Un seul mapping, jamais de couleur en dur dans un composant.
export const LIBELLE_STATUT: Record<StatutAgent, string> = {
  PRESENT: "Présent",
  EN_CONGE: "En congé",
  CONGE_DEPASSE: "Retour non saisi",
  SUSPENDU: "Suspendu",
  DEMISSIONNE: "Démissionné",
  LICENCIE: "Licencié",
  RETRAITE: "Retraité",
  DECEDE: "Décédé",
};

export const COULEUR_STATUT: Record<StatutAgent, "vert" | "ambre" | "gris" | "rouge"> = {
  PRESENT: "vert",
  EN_CONGE: "ambre",
  CONGE_DEPASSE: "rouge",
  SUSPENDU: "ambre",
  DEMISSIONNE: "gris",
  LICENCIE: "gris",
  RETRAITE: "gris",
  DECEDE: "gris",
};
