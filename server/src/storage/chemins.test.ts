import { describe, expect, it } from "vitest";
import { cheminCorbeille, cheminDocument, resoudreCheminAbsolu } from "./chemins";

describe("cheminDocument / cheminCorbeille", () => {
  it("construit {annee}/{agentId}/{uuid}.{ext}", () => {
    expect(cheminDocument(2026, "agent-123", "abc-def", "pdf")).toBe("2026/agent-123/abc-def.pdf");
  });

  it("construit _corbeille/{annee}/{uuid}.{ext}", () => {
    expect(cheminCorbeille(2026, "abc-def", "jpg")).toBe("_corbeille/2026/abc-def.jpg");
  });
});

describe("resoudreCheminAbsolu", () => {
  const racine = "/donnees/documents";

  it("résout un chemin relatif normal sous la racine", () => {
    const resultat = resoudreCheminAbsolu(racine, "2026/agent-1/uuid.pdf");
    // path.resolve() préfixe le lecteur courant sous Windows (ex: "D:/donnees/...") ;
    // ce n'est pas ce qu'on teste ici, seulement que la racine relative est respectée.
    expect(resultat.replaceAll("\\", "/")).toMatch(/\/donnees\/documents\/2026\/agent-1\/uuid\.pdf$/);
  });

  it("rejette une tentative de sortie de la racine (../..)", () => {
    expect(() => resoudreCheminAbsolu(racine, "../../etc/passwd")).toThrow(/hors de la racine/);
  });

  it("rejette un chemin absolu qui écraserait la racine", () => {
    expect(() => resoudreCheminAbsolu(racine, "/etc/passwd")).toThrow(/hors de la racine/);
  });
});
