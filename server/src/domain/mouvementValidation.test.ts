import { describe, expect, it } from "vitest";
import { validerNouveauMouvement } from "./mouvementValidation";
import type { MouvementPourStatut } from "./statut";

const RECRUTEMENT_DATE = new Date("2020-01-01");
function m(partiel: Partial<MouvementPourStatut> & Pick<MouvementPourStatut, "type" | "dateEffet">): MouvementPourStatut {
  return { dateFin: null, createdAt: partiel.dateEffet, annuleLe: null, ...partiel };
}
const RECRUTEMENT_SEUL = [m({ type: "RECRUTEMENT", dateEffet: RECRUTEMENT_DATE })];

describe("validerNouveauMouvement — les 5 refus", () => {
  it("refuse une dateEffet antérieure à la date de recrutement", () => {
    const erreur = validerNouveauMouvement(
      RECRUTEMENT_SEUL,
      { type: "CONGE", dateEffet: new Date("2019-12-31"), dateFin: new Date("2020-01-15") },
      RECRUTEMENT_DATE,
    );
    expect(erreur?.message).toMatch(/antérieure à la date de recrutement/);
  });

  it("refuse tout mouvement si l'agent est déjà dans un état définitif", () => {
    const mouvements = [...RECRUTEMENT_SEUL, m({ type: "DEMISSION", dateEffet: new Date("2024-01-01") })];
    const erreur = validerNouveauMouvement(
      mouvements,
      { type: "CONGE", dateEffet: new Date("2026-01-01"), dateFin: new Date("2026-01-15") },
      RECRUTEMENT_DATE,
    );
    expect(erreur?.message).toMatch(/état définitif/);
  });

  it("refuse d'ouvrir un CONGE si un congé est déjà en cours", () => {
    const mouvements = [
      ...RECRUTEMENT_SEUL,
      m({ type: "CONGE", dateEffet: new Date("2026-01-01"), dateFin: new Date("2026-12-31") }),
    ];
    const erreur = validerNouveauMouvement(
      mouvements,
      { type: "CONGE", dateEffet: new Date("2026-06-01"), dateFin: new Date("2026-06-15") },
      RECRUTEMENT_DATE,
    );
    expect(erreur?.message).toMatch(/congé est déjà en cours/);
  });

  it("refuse d'ouvrir une SUSPENSION si une suspension est déjà en cours", () => {
    const mouvements = [...RECRUTEMENT_SEUL, m({ type: "SUSPENSION", dateEffet: new Date("2026-01-01") })];
    const erreur = validerNouveauMouvement(
      mouvements,
      { type: "SUSPENSION", dateEffet: new Date("2026-06-01"), dateFin: null },
      RECRUTEMENT_DATE,
    );
    expect(erreur?.message).toMatch(/suspension est déjà en cours/);
  });

  it("refuse un FIN_SUSPENSION sans suspension en cours", () => {
    const erreur = validerNouveauMouvement(
      RECRUTEMENT_SEUL,
      { type: "FIN_SUSPENSION", dateEffet: new Date("2026-06-01"), dateFin: null },
      RECRUTEMENT_DATE,
    );
    expect(erreur?.message).toMatch(/Aucune suspension en cours/);
  });

  it("refuse un CONGE sans dateFin", () => {
    const erreur = validerNouveauMouvement(
      RECRUTEMENT_SEUL,
      { type: "CONGE", dateEffet: new Date("2026-06-01"), dateFin: null },
      RECRUTEMENT_DATE,
    );
    expect(erreur?.message).toMatch(/doit obligatoirement avoir une date de fin/);
    expect(erreur?.champ).toBe("dateFin");
  });

  it("refuse un mouvement définitif sans motif", () => {
    const erreur = validerNouveauMouvement(
      RECRUTEMENT_SEUL,
      { type: "DEMISSION", dateEffet: new Date("2026-06-01"), dateFin: null, motif: null },
      RECRUTEMENT_DATE,
    );
    expect(erreur?.message).toMatch(/motif est obligatoire/);
    expect(erreur?.champ).toBe("motif");
  });

  it("accepte un mouvement définitif avec motif", () => {
    const erreur = validerNouveauMouvement(
      RECRUTEMENT_SEUL,
      { type: "DEMISSION", dateEffet: new Date("2026-06-01"), dateFin: null, motif: "Départ volontaire" },
      RECRUTEMENT_DATE,
    );
    expect(erreur).toBeNull();
  });

  it("chaque refus cible le bon champ", () => {
    const erreurEtatDefinitif = validerNouveauMouvement(
      [...RECRUTEMENT_SEUL, m({ type: "DEMISSION", dateEffet: new Date("2024-01-01") })],
      { type: "CONGE", dateEffet: new Date("2026-01-01"), dateFin: new Date("2026-01-15") },
      RECRUTEMENT_DATE,
    );
    expect(erreurEtatDefinitif?.champ).toBeNull();
  });

  it("accepte un mouvement valide", () => {
    const erreur = validerNouveauMouvement(
      RECRUTEMENT_SEUL,
      { type: "CONGE", dateEffet: new Date("2026-06-01"), dateFin: new Date("2026-06-15") },
      RECRUTEMENT_DATE,
    );
    expect(erreur).toBeNull();
  });

  it("accepte d'ouvrir un CONGE quand le dernier congé est seulement dépassé (anomalie, pas en cours)", () => {
    const mouvements = [
      ...RECRUTEMENT_SEUL,
      m({ type: "CONGE", dateEffet: new Date("2024-01-01"), dateFin: new Date("2024-01-15") }),
    ];
    const erreur = validerNouveauMouvement(
      mouvements,
      { type: "CONGE", dateEffet: new Date("2026-06-01"), dateFin: new Date("2026-06-15") },
      RECRUTEMENT_DATE,
    );
    expect(erreur).toBeNull();
  });

  it("accepte un FIN_SUSPENSION quand une suspension est bien en cours", () => {
    const mouvements = [...RECRUTEMENT_SEUL, m({ type: "SUSPENSION", dateEffet: new Date("2026-01-01") })];
    const erreur = validerNouveauMouvement(
      mouvements,
      { type: "FIN_SUSPENSION", dateEffet: new Date("2026-06-01"), dateFin: null },
      RECRUTEMENT_DATE,
    );
    expect(erreur).toBeNull();
  });
});
