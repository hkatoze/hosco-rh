import { describe, expect, it } from "vitest";
import { dateDuJour, statutAgent, type MouvementPourStatut } from "./statut";

const REF = new Date("2026-06-15");

function m(partiel: Partial<MouvementPourStatut> & Pick<MouvementPourStatut, "type" | "dateEffet">): MouvementPourStatut {
  return { dateFin: null, createdAt: partiel.dateEffet, annuleLe: null, ...partiel };
}

describe("dateDuJour", () => {
  it("tronque à minuit UTC, même granularité que CURRENT_DATE / @db.Date", () => {
    const resultat = dateDuJour(new Date("2026-06-15T18:42:07Z"));
    expect(resultat.toISOString()).toBe("2026-06-15T00:00:00.000Z");
  });

  it("un congé qui se termine aujourd'hui est EN_CONGE quelle que soit l'heure de la vérification", () => {
    const soir = new Date("2026-06-15T23:00:00Z");
    const mouvements = [
      m({ type: "RECRUTEMENT", dateEffet: new Date("2020-01-01") }),
      m({ type: "CONGE", dateEffet: new Date("2026-06-01"), dateFin: new Date("2026-06-15") }),
    ];
    expect(statutAgent(mouvements, dateDuJour(soir))).toBe("EN_CONGE");
  });
});

describe("statutAgent — cas limites", () => {
  it("agent sans aucun mouvement -> PRESENT", () => {
    expect(statutAgent([], REF)).toBe("PRESENT");
  });

  it("un mouvement futur (dateEffet > référence) est totalement ignoré", () => {
    const mouvements = [
      m({ type: "RECRUTEMENT", dateEffet: new Date("2020-01-01") }),
      m({ type: "DEMISSION", dateEffet: new Date("2026-07-01") }), // après REF
    ];
    expect(statutAgent(mouvements, REF)).toBe("PRESENT");
  });

  it("RECRUTEMENT seul -> PRESENT", () => {
    const mouvements = [m({ type: "RECRUTEMENT", dateEffet: new Date("2020-01-01") })];
    expect(statutAgent(mouvements, REF)).toBe("PRESENT");
  });
});

describe("statutAgent — règle 1 : mouvements définitifs", () => {
  it.each([
    ["DEMISSION", "DEMISSIONNE"],
    ["LICENCIEMENT", "LICENCIE"],
    ["RETRAITE", "RETRAITE"],
    ["DECES", "DECEDE"],
  ] as const)("%s -> %s", (type, statutAttendu) => {
    const mouvements = [
      m({ type: "RECRUTEMENT", dateEffet: new Date("2020-01-01") }),
      m({ type, dateEffet: new Date("2025-01-01") }),
    ];
    expect(statutAgent(mouvements, REF)).toBe(statutAttendu);
  });

  it("un mouvement définitif l'emporte même si un mouvement postérieur existe (erreur de saisie)", () => {
    const mouvements = [
      m({ type: "RECRUTEMENT", dateEffet: new Date("2020-01-01") }),
      m({ type: "DEMISSION", dateEffet: new Date("2025-01-01") }),
      m({ type: "CONGE", dateEffet: new Date("2026-01-01"), dateFin: new Date("2026-02-01") }),
    ];
    expect(statutAgent(mouvements, REF)).toBe("DEMISSIONNE");
  });

  it("le mouvement définitif futur n'a aucun effet", () => {
    const mouvements = [
      m({ type: "RECRUTEMENT", dateEffet: new Date("2020-01-01") }),
      m({ type: "RETRAITE", dateEffet: new Date("2026-07-01") }), // après REF
    ];
    expect(statutAgent(mouvements, REF)).toBe("PRESENT");
  });
});

describe("statutAgent — règle 2 : suspension", () => {
  it("SUSPENSION sans FIN_SUSPENSION -> SUSPENDU", () => {
    const mouvements = [
      m({ type: "RECRUTEMENT", dateEffet: new Date("2020-01-01") }),
      m({ type: "SUSPENSION", dateEffet: new Date("2026-01-01") }),
    ];
    expect(statutAgent(mouvements, REF)).toBe("SUSPENDU");
  });

  it("SUSPENSION suivie d'un FIN_SUSPENSION -> PRESENT", () => {
    const mouvements = [
      m({ type: "RECRUTEMENT", dateEffet: new Date("2020-01-01") }),
      m({ type: "SUSPENSION", dateEffet: new Date("2026-01-01") }),
      m({ type: "FIN_SUSPENSION", dateEffet: new Date("2026-02-01") }),
    ];
    expect(statutAgent(mouvements, REF)).toBe("PRESENT");
  });

  it("SUSPENSION et FIN_SUSPENSION le même jour : createdAt départage (fin après)", () => {
    const jour = new Date("2026-01-01");
    const mouvements = [
      m({ type: "RECRUTEMENT", dateEffet: new Date("2020-01-01") }),
      m({ type: "SUSPENSION", dateEffet: jour, createdAt: new Date("2026-01-01T08:00:00Z") }),
      m({ type: "FIN_SUSPENSION", dateEffet: jour, createdAt: new Date("2026-01-01T09:00:00Z") }),
    ];
    expect(statutAgent(mouvements, REF)).toBe("PRESENT");
  });

  it("SUSPENSION et FIN_SUSPENSION le même jour : createdAt départage (fin avant, donc pas postérieure)", () => {
    const jour = new Date("2026-01-01");
    const mouvements = [
      m({ type: "RECRUTEMENT", dateEffet: new Date("2020-01-01") }),
      m({ type: "FIN_SUSPENSION", dateEffet: jour, createdAt: new Date("2026-01-01T07:00:00Z") }),
      m({ type: "SUSPENSION", dateEffet: jour, createdAt: new Date("2026-01-01T08:00:00Z") }),
    ];
    expect(statutAgent(mouvements, REF)).toBe("SUSPENDU");
  });

  it("second cycle de suspension en cours après un premier déjà clos -> SUSPENDU", () => {
    const mouvements = [
      m({ type: "RECRUTEMENT", dateEffet: new Date("2020-01-01") }),
      m({ type: "SUSPENSION", dateEffet: new Date("2024-01-01") }),
      m({ type: "FIN_SUSPENSION", dateEffet: new Date("2024-02-01") }),
      m({ type: "SUSPENSION", dateEffet: new Date("2026-01-01") }),
    ];
    expect(statutAgent(mouvements, REF)).toBe("SUSPENDU");
  });

  it("suspension prioritaire sur un congé qui la suit dans l'historique (ordre des règles)", () => {
    const mouvements = [
      m({ type: "RECRUTEMENT", dateEffet: new Date("2020-01-01") }),
      m({ type: "SUSPENSION", dateEffet: new Date("2026-01-01") }),
      m({ type: "CONGE", dateEffet: new Date("2026-06-01"), dateFin: new Date("2026-06-20") }),
    ];
    expect(statutAgent(mouvements, REF)).toBe("SUSPENDU");
  });
});

describe("statutAgent — règle 3 : congé en cours", () => {
  it("dateEffet <= référence <= dateFin -> EN_CONGE", () => {
    const mouvements = [
      m({ type: "RECRUTEMENT", dateEffet: new Date("2020-01-01") }),
      m({ type: "CONGE", dateEffet: new Date("2026-06-01"), dateFin: new Date("2026-06-30") }),
    ];
    expect(statutAgent(mouvements, REF)).toBe("EN_CONGE");
  });

  it("borne inférieure : référence == dateEffet -> EN_CONGE", () => {
    const mouvements = [
      m({ type: "RECRUTEMENT", dateEffet: new Date("2020-01-01") }),
      m({ type: "CONGE", dateEffet: REF, dateFin: new Date("2026-06-30") }),
    ];
    expect(statutAgent(mouvements, REF)).toBe("EN_CONGE");
  });

  it("borne supérieure : référence == dateFin -> EN_CONGE", () => {
    const mouvements = [
      m({ type: "RECRUTEMENT", dateEffet: new Date("2020-01-01") }),
      m({ type: "CONGE", dateEffet: new Date("2026-06-01"), dateFin: REF }),
    ];
    expect(statutAgent(mouvements, REF)).toBe("EN_CONGE");
  });
});

describe("statutAgent — règle 4 : congé dépassé", () => {
  it("dateFin dépassée, aucun mouvement postérieur -> CONGE_DEPASSE", () => {
    const mouvements = [
      m({ type: "RECRUTEMENT", dateEffet: new Date("2020-01-01") }),
      m({ type: "CONGE", dateEffet: new Date("2026-01-01"), dateFin: new Date("2026-02-01") }),
    ];
    expect(statutAgent(mouvements, REF)).toBe("CONGE_DEPASSE");
  });

  it("dateFin dépassée mais un second congé, plus récent, est en cours -> EN_CONGE (règle 3 avant 4)", () => {
    const mouvements = [
      m({ type: "RECRUTEMENT", dateEffet: new Date("2020-01-01") }),
      m({ type: "CONGE", dateEffet: new Date("2026-01-01"), dateFin: new Date("2026-02-01") }),
      m({ type: "CONGE", dateEffet: new Date("2026-06-01"), dateFin: new Date("2026-06-30") }),
    ];
    expect(statutAgent(mouvements, REF)).toBe("EN_CONGE");
  });

  it("un RETOUR_CONGE postérieur referme le congé dépassé -> PRESENT", () => {
    const mouvements = [
      m({ type: "RECRUTEMENT", dateEffet: new Date("2020-01-01") }),
      m({ type: "CONGE", dateEffet: new Date("2026-01-01"), dateFin: new Date("2026-02-01") }),
      m({ type: "RETOUR_CONGE", dateEffet: new Date("2026-02-02") }),
    ];
    expect(statutAgent(mouvements, REF)).toBe("PRESENT");
  });

  it("dateFin dépassée mais une suspension a été ouverte ensuite -> SUSPENDU (règle 2 avant 4)", () => {
    const mouvements = [
      m({ type: "RECRUTEMENT", dateEffet: new Date("2020-01-01") }),
      m({ type: "CONGE", dateEffet: new Date("2026-01-01"), dateFin: new Date("2026-02-01") }),
      m({ type: "SUSPENSION", dateEffet: new Date("2026-03-01") }),
    ];
    expect(statutAgent(mouvements, REF)).toBe("SUSPENDU");
  });

  it("référence égale à dateFin -> EN_CONGE, pas CONGE_DEPASSE (dernier jour inclus)", () => {
    const mouvements = [
      m({ type: "RECRUTEMENT", dateEffet: new Date("2020-01-01") }),
      m({ type: "CONGE", dateEffet: new Date("2026-06-01"), dateFin: REF }),
    ];
    expect(statutAgent(mouvements, REF)).toBe("EN_CONGE");
  });

  it("référence un jour après dateFin -> CONGE_DEPASSE", () => {
    const dateFin = new Date(REF);
    dateFin.setDate(dateFin.getDate() - 1);
    const mouvements = [
      m({ type: "RECRUTEMENT", dateEffet: new Date("2020-01-01") }),
      m({ type: "CONGE", dateEffet: new Date("2026-06-01"), dateFin }),
    ];
    expect(statutAgent(mouvements, REF)).toBe("CONGE_DEPASSE");
  });
});

describe("statutAgent — mouvement annulé", () => {
  it("un mouvement définitif annulé est ignoré, comme s'il n'existait pas", () => {
    const mouvements = [
      m({ type: "RECRUTEMENT", dateEffet: new Date("2020-01-01") }),
      m({ type: "DEMISSION", dateEffet: new Date("2025-01-01"), annuleLe: new Date("2025-01-02") }),
    ];
    expect(statutAgent(mouvements, REF)).toBe("PRESENT");
  });

  it("une suspension annulée n'empêche pas un congé postérieur d'être pris en compte", () => {
    const mouvements = [
      m({ type: "RECRUTEMENT", dateEffet: new Date("2020-01-01") }),
      m({ type: "SUSPENSION", dateEffet: new Date("2026-01-01"), annuleLe: new Date("2026-01-05") }),
      m({ type: "CONGE", dateEffet: new Date("2026-06-01"), dateFin: new Date("2026-06-30") }),
    ];
    expect(statutAgent(mouvements, REF)).toBe("EN_CONGE");
  });

  it("un congé annulé ne compte plus comme dernier mouvement (pas de CONGE_DEPASSE)", () => {
    const mouvements = [
      m({ type: "RECRUTEMENT", dateEffet: new Date("2020-01-01") }),
      m({ type: "CONGE", dateEffet: new Date("2026-01-01"), dateFin: new Date("2026-02-01"), annuleLe: new Date("2026-01-10") }),
    ];
    expect(statutAgent(mouvements, REF)).toBe("PRESENT");
  });
});
