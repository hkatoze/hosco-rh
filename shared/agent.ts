import { z } from "zod";

// Schémas Zod partagés entre le serveur et le front (voir CLAUDE.md, tâche
// 6, point 2) : une seule définition des règles de validation, donc des
// messages identiques des deux côtés. Le serveur revalide systématiquement
// ces mêmes schémas — ce partage sert la cohérence, jamais à lui faire
// confiance au client.

export const SEXES = ["MASCULIN", "FEMININ"] as const;
export const TYPES_CONTRAT = ["CDI", "CDD", "STAGE", "VACATAIRE"] as const;
export const SITUATIONS_MATRIMONIALES = ["CELIBATAIRE", "MARIE", "DIVORCE", "VEUF"] as const;

export type Sexe = (typeof SEXES)[number];
export type TypeContrat = (typeof TYPES_CONTRAT)[number];
export type SituationMatrimoniale = (typeof SITUATIONS_MATRIMONIALES)[number];

const champObligatoire = "Ce champ est requis.";

export const schemaAgentBase = {
  nom: z.string().trim().min(1, champObligatoire),
  prenom: z.string().trim().min(1, champObligatoire),
  sexe: z.enum(SEXES, { errorMap: () => ({ message: "Sélectionnez un genre." }) }),
  dateNaissance: z.coerce.date().nullable().optional(),
  lieuNaissance: z.string().trim().min(1).nullable().optional(),
  situationMatrimoniale: z.enum(SITUATIONS_MATRIMONIALES).nullable().optional(),
  telephone: z.string().trim().min(1).nullable().optional(),
  adresse: z.string().trim().min(1).nullable().optional(),
  numeroCnss: z.string().trim().min(1).nullable().optional(),
  fonction: z.string().trim().min(1, champObligatoire),
  dateRecrutement: z.coerce.date({ errorMap: () => ({ message: "Date de recrutement invalide." }) }),
  typeContrat: z.enum(TYPES_CONTRAT, { errorMap: () => ({ message: "Sélectionnez un type de contrat." }) }),
  serviceId: z.string().uuid("Sélectionnez un service."),
};

export const schemaCreationAgent = z.object({
  matricule: z.string().trim().min(1, champObligatoire),
  ...schemaAgentBase,
});

// Le matricule n'apparaît pas ici : il est immuable après création (voir
// CLAUDE.md, tâche 6, point 4 — lecture seule en modification).
export const schemaModificationAgent = z.object(schemaAgentBase).partial();

export type CreationAgent = z.infer<typeof schemaCreationAgent>;
export type ModificationAgent = z.infer<typeof schemaModificationAgent>;
