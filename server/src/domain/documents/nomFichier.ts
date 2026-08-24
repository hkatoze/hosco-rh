const LONGUEUR_MAX = 255;

// Construit la regex des caractères de contrôle (codes 0 à 31, et 127) à
// partir des codes numériques plutôt que d'un littéral \x, pour éviter
// tout risque qu'un caractère de contrôle brut se glisse dans le fichier
// source lui-même.
function construireRegexCaracteresControle(): RegExp {
  const codes: number[] = [];
  for (let i = 0; i <= 31; i++) codes.push(i);
  codes.push(127);
  const motif = codes.map((c) => String.fromCharCode(92, 117) + c.toString(16).padStart(4, "0")).join("");
  return new RegExp(`[${motif}]`, "g");
}
const CARACTERES_CONTROLE = construireRegexCaracteresControle();

/**
 * Nettoie le nom de fichier d'origine avant stockage en base pour
 * affichage. Ce nom ne sert JAMAIS à construire un chemin sur le disque
 * (voir chemins.ts) — le nettoyage ici est une défense en profondeur pour
 * l'affichage (ex: en-tête Content-Disposition), pas un mécanisme de
 * sécurité du stockage.
 */
export function nettoyerNomFichier(nomOrigine: string): string {
  let nom = nomOrigine.normalize("NFC");
  nom = nom.replace(CARACTERES_CONTROLE, "");
  nom = nom.replaceAll("..", "");
  nom = nom.replace(/[/\\]/g, "_");
  nom = nom.trim();
  if (nom.length === 0) nom = "document";
  if (nom.length > LONGUEUR_MAX) nom = nom.slice(0, LONGUEUR_MAX);
  return nom;
}
