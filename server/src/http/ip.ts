import type { Context } from "hono";

export function obtenirIp(c: Context): string {
  return c.req.header("x-forwarded-for")?.split(",")[0]?.trim() ?? "inconnue";
}
