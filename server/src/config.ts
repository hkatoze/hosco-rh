import { fileURLToPath } from "node:url";

function lireBooleen(valeur: string | undefined, defaut: boolean): boolean {
  if (valeur === undefined) return defaut;
  return valeur === "true";
}

export const config = {
  port: Number(process.env.PORT ?? 3000),
  cookieSecure: lireBooleen(process.env.COOKIE_SECURE, false),
  origineAttendue: process.env.ORIGINE_ATTENDUE ?? "http://localhost:5173",
  // Hors de la racine web (voir CLAUDE.md) : jamais servi statiquement.
  documentsRacine: process.env.DOCUMENTS_RACINE ?? fileURLToPath(new URL("../.donnees/documents/", import.meta.url)),
};
