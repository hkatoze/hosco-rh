import { createHash, randomBytes } from "node:crypto";

export const NOM_COOKIE = "hosco_session";

export const DUREE_INACTIVITE_MS = 8 * 60 * 60 * 1000;
export const DUREE_ABSOLUE_MS = 12 * 60 * 60 * 1000;
export const INTERVALLE_MIN_ECRITURE_MS = 60 * 1000;

export function genererToken(): string {
  return randomBytes(32).toString("base64url");
}

export function hacherToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export interface EtatSession {
  createdAt: Date;
  derniereActivite: Date;
  expireLe: Date;
}

/** Une session est valide tant que la date courante n'a pas atteint expireLe. */
export function sessionValide(session: EtatSession, maintenant: Date): boolean {
  return maintenant.getTime() < session.expireLe.getTime();
}

/**
 * Prochaine expiration : la plus proche entre 8h d'inactivité glissante
 * depuis maintenant, et 12h absolues depuis la création de la session.
 */
export function calculerNouvelleExpiration(session: Pick<EtatSession, "createdAt">, maintenant: Date): Date {
  const limiteInactivite = maintenant.getTime() + DUREE_INACTIVITE_MS;
  const limiteAbsolue = session.createdAt.getTime() + DUREE_ABSOLUE_MS;
  return new Date(Math.min(limiteInactivite, limiteAbsolue));
}

/** Throttle : on n'écrit derniereActivite/expireLe qu'une fois par minute au plus. */
export function doitRafraichir(session: Pick<EtatSession, "derniereActivite">, maintenant: Date): boolean {
  return maintenant.getTime() - session.derniereActivite.getTime() >= INTERVALLE_MIN_ECRITURE_MS;
}
