import path from "node:path";

const NOM_CORBEILLE = "_corbeille";

/** {annee}/{agentId}/{uuid}.{ext} — chemin relatif à DOCUMENTS_RACINE. */
export function cheminDocument(annee: number, agentId: string, uuid: string, extension: string): string {
  return path.posix.join(String(annee), agentId, `${uuid}.${extension}`);
}

/** {_corbeille}/{annee}/{uuid}.{ext} — chemin relatif à DOCUMENTS_RACINE. */
export function cheminCorbeille(annee: number, uuid: string, extension: string): string {
  return path.posix.join(NOM_CORBEILLE, String(annee), `${uuid}.${extension}`);
}

/**
 * Résout un chemin relatif (venant EXCLUSIVEMENT de la base de données,
 * jamais de la requête HTTP) en chemin absolu sous la racine. Vérifie que
 * le résultat reste bien sous la racine — filet de sécurité, pas la
 * défense principale : la défense principale est que ce chemin relatif
 * n'est jamais construit à partir d'une entrée utilisateur.
 */
export function resoudreCheminAbsolu(racine: string, cheminRelatif: string): string {
  const racineAbsolue = path.resolve(racine);
  const cheminAbsolu = path.resolve(racineAbsolue, cheminRelatif);
  const prefixeAttendu = racineAbsolue.endsWith(path.sep) ? racineAbsolue : racineAbsolue + path.sep;
  if (cheminAbsolu !== racineAbsolue && !cheminAbsolu.startsWith(prefixeAttendu)) {
    throw new Error(`Chemin résolu hors de la racine des documents : ${cheminRelatif}`);
  }
  return cheminAbsolu;
}

export function racineCorbeille(): string {
  return NOM_CORBEILLE;
}
