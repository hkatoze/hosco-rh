import { describe, expect, it } from "vitest";
import { nettoyerNomFichier } from "./nomFichier";

describe("nettoyerNomFichier", () => {
  it("laisse passer un nom normal", () => {
    expect(nettoyerNomFichier("rapport-annuel.pdf")).toBe("rapport-annuel.pdf");
  });

  it("retire les caractères de contrôle (ex: retour à la ligne, tabulation)", () => {
    const octetsControle = String.fromCharCode(0, 7, 9, 10, 13, 127);
    expect(nettoyerNomFichier(`rapport${octetsControle}.pdf`)).toBe("rapport.pdf");
  });

  it("retire les séquences de traversée de répertoire", () => {
    expect(nettoyerNomFichier("../../etc/passwd")).not.toContain("..");
    expect(nettoyerNomFichier("../../etc/passwd")).toBe("__etc_passwd");
  });

  it("neutralise les séparateurs de chemin", () => {
    expect(nettoyerNomFichier("dossier/sous-dossier\\fichier.pdf")).toBe("dossier_sous-dossier_fichier.pdf");
  });

  it("tronque à 255 caractères", () => {
    const resultat = nettoyerNomFichier("x".repeat(400));
    expect(resultat.length).toBe(255);
  });

  it("un nom vidé par le nettoyage devient 'document'", () => {
    expect(nettoyerNomFichier("..")).toBe("document");
  });
});
