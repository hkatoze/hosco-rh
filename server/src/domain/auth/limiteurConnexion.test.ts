import { beforeEach, describe, expect, it } from "vitest";
import { LimiteurConnexion } from "./limiteurConnexion";

describe("LimiteurConnexion", () => {
  let limiteur: LimiteurConnexion;
  const t0 = new Date("2026-01-01T10:00:00Z");

  beforeEach(() => {
    limiteur = new LimiteurConnexion();
  });

  it("n'est pas bloqué avant tout échec", () => {
    expect(limiteur.estBloque("admin.rh", "10.0.0.1", t0)).toBe(false);
  });

  it("bloque au 5e échec, pas avant", () => {
    for (let i = 0; i < 4; i++) {
      const declenche = limiteur.enregistrerEchec("admin.rh", "10.0.0.1", t0);
      expect(declenche).toBe(false);
      expect(limiteur.estBloque("admin.rh", "10.0.0.1", t0)).toBe(false);
    }
    const declencheAu5e = limiteur.enregistrerEchec("admin.rh", "10.0.0.1", t0);
    expect(declencheAu5e).toBe(true);
    expect(limiteur.estBloque("admin.rh", "10.0.0.1", t0)).toBe(true);
  });

  it("le blocage dure 15 minutes puis se lève", () => {
    for (let i = 0; i < 5; i++) limiteur.enregistrerEchec("admin.rh", "10.0.0.1", t0);
    const justeAvant = new Date(t0.getTime() + 15 * 60 * 1000 - 1);
    const justeApres = new Date(t0.getTime() + 15 * 60 * 1000 + 1);
    expect(limiteur.estBloque("admin.rh", "10.0.0.1", justeAvant)).toBe(true);
    expect(limiteur.estBloque("admin.rh", "10.0.0.1", justeApres)).toBe(false);
  });

  it("ne mélange pas les compteurs entre identifiants différents sur la même IP", () => {
    for (let i = 0; i < 5; i++) limiteur.enregistrerEchec("admin.rh", "10.0.0.1", t0);
    expect(limiteur.estBloque("admin.rh", "10.0.0.1", t0)).toBe(true);
    expect(limiteur.estBloque("saisie.rh", "10.0.0.1", t0)).toBe(false);
  });

  it("ne mélange pas les compteurs entre IP différentes pour le même identifiant", () => {
    for (let i = 0; i < 5; i++) limiteur.enregistrerEchec("admin.rh", "10.0.0.1", t0);
    expect(limiteur.estBloque("admin.rh", "10.0.0.1", t0)).toBe(true);
    expect(limiteur.estBloque("admin.rh", "10.0.0.2", t0)).toBe(false);
  });

  it("réinitialise le compteur si la fenêtre de 15 minutes est dépassée sans atteindre le seuil", () => {
    for (let i = 0; i < 3; i++) limiteur.enregistrerEchec("admin.rh", "10.0.0.1", t0);
    const bienPlusTard = new Date(t0.getTime() + 16 * 60 * 1000);
    // Repart d'un compteur à 1, donc 4 échecs supplémentaires ne bloquent pas encore.
    for (let i = 0; i < 4; i++) limiteur.enregistrerEchec("admin.rh", "10.0.0.1", bienPlusTard);
    expect(limiteur.estBloque("admin.rh", "10.0.0.1", bienPlusTard)).toBe(false);
  });

  it("reinitialiser() efface l'historique d'échecs (connexion réussie)", () => {
    for (let i = 0; i < 4; i++) limiteur.enregistrerEchec("admin.rh", "10.0.0.1", t0);
    limiteur.reinitialiser("admin.rh", "10.0.0.1");
    for (let i = 0; i < 4; i++) {
      expect(limiteur.enregistrerEchec("admin.rh", "10.0.0.1", t0)).toBe(false);
    }
  });
});
