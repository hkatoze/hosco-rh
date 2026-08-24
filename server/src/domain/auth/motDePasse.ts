import { randomInt } from "node:crypto";
import argon2 from "argon2";

// Hash argon2 valide d'une valeur arbitraire, utilisé uniquement pour que la
// vérification d'un identifiant inconnu prenne un temps comparable à une
// vérification réelle (protection contre l'énumération de comptes par timing).
const HASH_FACTICE =
  "$argon2id$v=19$m=65536,t=3,p=4$SxC7MNg5ykBtgJfglT96Yg$zmf/IGmZL2bBAXkc2Kxws1+atws0XKGLWE7ZkKDb9jk";

export const LONGUEUR_MOT_DE_PASSE_MIN = 8;

export async function hacherMotDePasse(motDePasse: string): Promise<string> {
  return argon2.hash(motDePasse);
}

export async function verifierMotDePasse(hash: string, motDePasse: string): Promise<boolean> {
  return argon2.verify(hash, motDePasse);
}

export async function verifierMotDePasseFactice(motDePasse: string): Promise<void> {
  await argon2.verify(HASH_FACTICE, motDePasse);
}

const CARACTERES_MOT_DE_PASSE_TEMPORAIRE = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";

/** Mot de passe temporaire lisible, affiché une seule fois à l'écran par l'ADMIN. */
export function genererMotDePasseTemporaire(longueur = 12): string {
  let resultat = "";
  for (let i = 0; i < longueur; i++) {
    resultat += CARACTERES_MOT_DE_PASSE_TEMPORAIRE[randomInt(0, CARACTERES_MOT_DE_PASSE_TEMPORAIRE.length)];
  }
  return resultat;
}
