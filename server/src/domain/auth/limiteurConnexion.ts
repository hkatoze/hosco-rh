const FENETRE_MS = 15 * 60 * 1000;
const SEUIL_ECHECS = 5;

interface EtatTentatives {
  echecs: number;
  fenetreDebut: number;
  bloqueJusqua: number | null;
}

/**
 * Compteur d'échecs de connexion par (identifiant, IP), en mémoire, instance
 * unique du process — suffisant pour un seul backend (voir CLAUDE.md).
 */
export class LimiteurConnexion {
  private etats = new Map<string, EtatTentatives>();

  private cle(identifiant: string, ip: string): string {
    return `${identifiant.toLowerCase()}::${ip}`;
  }

  estBloque(identifiant: string, ip: string, maintenant: Date): boolean {
    const etat = this.etats.get(this.cle(identifiant, ip));
    if (!etat?.bloqueJusqua) return false;
    return maintenant.getTime() < etat.bloqueJusqua;
  }

  /** Enregistre un échec ; retourne true si cet échec déclenche le blocage. */
  enregistrerEchec(identifiant: string, ip: string, maintenant: Date): boolean {
    const cle = this.cle(identifiant, ip);
    const existant = this.etats.get(cle);
    const t = maintenant.getTime();

    const etat: EtatTentatives =
      !existant || t - existant.fenetreDebut >= FENETRE_MS
        ? { echecs: 1, fenetreDebut: t, bloqueJusqua: null }
        : { ...existant, echecs: existant.echecs + 1 };

    let vientDeBloquer = false;
    if (etat.echecs >= SEUIL_ECHECS && etat.bloqueJusqua === null) {
      etat.bloqueJusqua = t + FENETRE_MS;
      vientDeBloquer = true;
    }

    this.etats.set(cle, etat);
    return vientDeBloquer;
  }

  /** À appeler après une connexion réussie pour effacer l'historique d'échecs. */
  reinitialiser(identifiant: string, ip: string): void {
    this.etats.delete(this.cle(identifiant, ip));
  }

  /** Réservé aux tests : vide tout l'état du limiteur (instance partagée entre tests). */
  reinitialiserTout(): void {
    this.etats.clear();
  }
}

export const limiteurConnexion = new LimiteurConnexion();
