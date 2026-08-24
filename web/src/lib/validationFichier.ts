import { TAILLE_MAX_OCTETS } from "../../../shared/document";

/**
 * Contrôle client AVANT l'envoi (voir CLAUDE.md, tâche 6, point 5) : évite
 * d'envoyer un fichier trop volumineux ou d'un type refusé pour rien. Le
 * serveur reste seul juge (octets d'en-tête, jamais l'extension) — ce
 * contrôle n'est qu'un filtre de confort.
 */
export function validerFichierAvantEnvoi(fichier: File, extensionsAcceptees: readonly string[]): string | null {
  if (fichier.size > TAILLE_MAX_OCTETS) {
    return `Fichier trop volumineux (maximum ${TAILLE_MAX_OCTETS / (1024 * 1024)} Mo).`;
  }
  const extension = `.${fichier.name.split(".").pop()?.toLowerCase() ?? ""}`;
  if (!extensionsAcceptees.includes(extension)) {
    return `Type de fichier non accepté (extensions autorisées : ${extensionsAcceptees.join(", ")}).`;
  }
  return null;
}

export function formaterTaille(octets: number): string {
  if (octets < 1024) return `${octets} o`;
  if (octets < 1024 * 1024) return `${(octets / 1024).toFixed(0)} Ko`;
  return `${(octets / (1024 * 1024)).toFixed(1)} Mo`;
}
