import { describe, expect, it } from "vitest";
import {
  DUREE_ABSOLUE_MS,
  DUREE_INACTIVITE_MS,
  INTERVALLE_MIN_ECRITURE_MS,
  calculerNouvelleExpiration,
  doitRafraichir,
  hacherToken,
  sessionValide,
} from "./session";

describe("sessionValide", () => {
  it("est valide avant expireLe", () => {
    const session = {
      createdAt: new Date("2026-01-01T08:00:00Z"),
      derniereActivite: new Date("2026-01-01T08:00:00Z"),
      expireLe: new Date("2026-01-01T16:00:00Z"),
    };
    expect(sessionValide(session, new Date("2026-01-01T09:00:00Z"))).toBe(true);
  });

  it("n'est plus valide après expireLe", () => {
    const session = {
      createdAt: new Date("2026-01-01T08:00:00Z"),
      derniereActivite: new Date("2026-01-01T08:00:00Z"),
      expireLe: new Date("2026-01-01T16:00:00Z"),
    };
    expect(sessionValide(session, new Date("2026-01-01T16:00:01Z"))).toBe(false);
  });
});

describe("calculerNouvelleExpiration — expiration glissante", () => {
  it("prolonge de 8h d'inactivité quand on est loin du maximum absolu", () => {
    const createdAt = new Date("2026-01-01T08:00:00Z");
    const maintenant = new Date("2026-01-01T09:00:00Z"); // 1h après création
    const resultat = calculerNouvelleExpiration({ createdAt }, maintenant);
    expect(resultat.getTime()).toBe(maintenant.getTime() + DUREE_INACTIVITE_MS);
  });
});

describe("calculerNouvelleExpiration — expiration absolue", () => {
  it("plafonne à 12h après la création même si l'agent est actif", () => {
    const createdAt = new Date("2026-01-01T08:00:00Z");
    // 10h après création : +8h d'inactivité dépasserait le plafond de 12h absolu.
    const maintenant = new Date("2026-01-01T18:00:00Z");
    const resultat = calculerNouvelleExpiration({ createdAt }, maintenant);
    expect(resultat.getTime()).toBe(createdAt.getTime() + DUREE_ABSOLUE_MS);
    expect(resultat.getTime()).toBeLessThan(maintenant.getTime() + DUREE_INACTIVITE_MS);
  });

  it("l'expiration absolue est bien atteinte 12h après la création, quelle que soit l'activité", () => {
    const createdAt = new Date("2026-01-01T08:00:00Z");
    const juste_avant = new Date(createdAt.getTime() + DUREE_ABSOLUE_MS - 1);
    const juste_apres = new Date(createdAt.getTime() + DUREE_ABSOLUE_MS + 1);
    const session = { createdAt, derniereActivite: createdAt, expireLe: new Date(createdAt.getTime() + DUREE_ABSOLUE_MS) };
    expect(sessionValide(session, juste_avant)).toBe(true);
    expect(sessionValide(session, juste_apres)).toBe(false);
  });
});

describe("doitRafraichir", () => {
  it("ne rafraîchit pas avant l'intervalle minimal d'une minute", () => {
    const derniereActivite = new Date("2026-01-01T08:00:00Z");
    const maintenant = new Date(derniereActivite.getTime() + INTERVALLE_MIN_ECRITURE_MS - 1);
    expect(doitRafraichir({ derniereActivite }, maintenant)).toBe(false);
  });

  it("rafraîchit une fois l'intervalle minimal écoulé", () => {
    const derniereActivite = new Date("2026-01-01T08:00:00Z");
    const maintenant = new Date(derniereActivite.getTime() + INTERVALLE_MIN_ECRITURE_MS);
    expect(doitRafraichir({ derniereActivite }, maintenant)).toBe(true);
  });
});

describe("hacherToken", () => {
  it("produit un hash déterministe et différent pour deux tokens différents", () => {
    expect(hacherToken("abc")).toBe(hacherToken("abc"));
    expect(hacherToken("abc")).not.toBe(hacherToken("def"));
  });
});
