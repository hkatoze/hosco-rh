import { z } from "zod";

export const TYPES_DOCUMENT = ["CV", "DIPLOME", "CONTRAT", "CNIB", "ACTE_NAISSANCE", "CERTIFICAT_MEDICAL", "AUTRE"] as const;

export type TypeDocument = (typeof TYPES_DOCUMENT)[number];

export const LIBELLE_TYPE_DOCUMENT: Record<TypeDocument, string> = {
  CV: "CV",
  DIPLOME: "Diplôme",
  CONTRAT: "Contrat",
  CNIB: "CNIB",
  ACTE_NAISSANCE: "Acte de naissance",
  CERTIFICAT_MEDICAL: "Certificat médical",
  AUTRE: "Autre",
};

export const schemaTypeDocument = z.enum(TYPES_DOCUMENT, { errorMap: () => ({ message: "Sélectionnez un type de document." }) });

// Contrôle client AVANT l'envoi (voir CLAUDE.md, tâche 6, point 5) : le
// serveur reste seul juge, ce n'est qu'un filtre pour éviter d'envoyer 10 Mo
// pour rien. Mêmes limites que server/src/storage/ecritureFlux.ts.
export const TAILLE_MAX_OCTETS = 10 * 1024 * 1024;
export const EXTENSIONS_ACCEPTEES = [".pdf", ".jpg", ".jpeg", ".png"] as const;
export const EXTENSIONS_ACCEPTEES_PHOTO = [".jpg", ".jpeg", ".png"] as const;
