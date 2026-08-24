import type { MiddlewareHandler } from "hono";

/** CSRF simple : sur toute requête non-GET, l'en-tête Origin doit correspondre exactement. */
export function verifierOrigine(origineAttendue: string): MiddlewareHandler {
  return async (c, next) => {
    if (c.req.method === "GET") {
      return next();
    }
    const origine = c.req.header("origin");
    if (origine !== origineAttendue) {
      return c.json({ error: "Origine non autorisée." }, 403);
    }
    return next();
  };
}
