import { z } from "zod";

export const TYPES_MOUVEMENT = [
  "RECRUTEMENT",
  "CONGE",
  "RETOUR_CONGE",
  "SUSPENSION",
  "FIN_SUSPENSION",
  "DEMISSION",
  "LICENCIEMENT",
  "RETRAITE",
  "DECES",
] as const;

export type TypeMouvement = (typeof TYPES_MOUVEMENT)[number];

/**
 * Types que l'utilisateur peut saisir depuis la modale de mouvement (voir
 * CLAUDE.md, tâche 6, point 6). RECRUTEMENT est créé automatiquement à la
 * création d'un agent (voir POST /api/agents) : jamais saisi à la main.
 */
export const TYPES_MOUVEMENT_SAISISSABLES = [
  "CONGE",
  "RETOUR_CONGE",
  "SUSPENSION",
  "FIN_SUSPENSION",
  "DEMISSION",
  "LICENCIEMENT",
  "RETRAITE",
  "DECES",
] as const satisfies readonly TypeMouvement[];

export const TYPES_MOUVEMENT_DEFINITIFS = ["DEMISSION", "LICENCIEMENT", "RETRAITE", "DECES"] as const satisfies readonly TypeMouvement[];

/**
 * Validation structurelle seulement : les règles qui dépendent du type
 * choisi (dateFin obligatoire pour un CONGE, motif obligatoire pour un
 * mouvement définitif...) dépendent de l'historique de l'agent et restent
 * la seule responsabilité de validerNouveauMouvement() côté serveur — voir
 * CLAUDE.md ("le partage sert la cohérence, jamais à faire confiance au
 * client"). La modale conditionne déjà l'affichage/le caractère requis des
 * champs selon le type sélectionné.
 */
export const schemaNouveauMouvement = z
  .object({
    type: z.enum(TYPES_MOUVEMENT, { errorMap: () => ({ message: "Sélectionnez un type de mouvement." }) }),
    dateEffet: z.coerce.date({ errorMap: () => ({ message: "Date d'effet invalide." }) }),
    dateFin: z.coerce.date().nullable().optional(),
    motif: z.string().trim().min(1).nullable().optional(),
    documentId: z.string().uuid().nullable().optional(),
  })
  .transform((v) => ({ ...v, dateFin: v.dateFin ?? null, motif: v.motif ?? null, documentId: v.documentId ?? null }));

export type NouveauMouvementSaisi = z.infer<typeof schemaNouveauMouvement>;

export const schemaAnnulationMouvement = z.object({
  motif: z.string().trim().min(10, "Le motif d'annulation doit contenir au moins 10 caractères."),
});
