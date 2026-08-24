import type { TypeMouvement } from "../api/types";

export const LIBELLE_TYPE_MOUVEMENT: Record<TypeMouvement, string> = {
  RECRUTEMENT: "Recrutement",
  CONGE: "Congé",
  SUSPENSION: "Suspension",
  FIN_SUSPENSION: "Fin de suspension",
  DEMISSION: "Démission",
  LICENCIEMENT: "Licenciement",
  RETRAITE: "Retraite",
  DECES: "Décès",
};
