import type { Hono } from "hono";
import type { RoleUtilisateur } from "@prisma/client";
import { prisma } from "../db";
import { hacherMotDePasse } from "../domain/auth/motDePasse";
import type { VariablesHono } from "./context";

type AppTest = Hono<{ Variables: VariablesHono }>;

export const ORIGINE_TEST = "http://localhost:5173";
export const MOT_DE_PASSE_TEST = "MotDePasseValide1";

let hashPartage: string | null = null;
async function hashTest(): Promise<string> {
  hashPartage ??= await hacherMotDePasse(MOT_DE_PASSE_TEST);
  return hashPartage;
}

export async function creerUtilisateurTest(identifiant: string, role: RoleUtilisateur) {
  return prisma.utilisateur.create({
    data: {
      identifiant,
      nom: `Test ${role}`,
      motDePasseHash: await hashTest(),
      role,
      actif: true,
      doitChangerMotDePasse: false,
    },
  });
}

export function entetes(cookie?: string): Record<string, string> {
  const en: Record<string, string> = { "Content-Type": "application/json", Origin: ORIGINE_TEST };
  if (cookie) en.Cookie = cookie;
  return en;
}

export async function poster(app: AppTest, chemin: string, corps: unknown, cookie?: string) {
  return app.request(chemin, { method: "POST", headers: entetes(cookie), body: JSON.stringify(corps) });
}

export async function patcher(app: AppTest, chemin: string, corps: unknown, cookie?: string) {
  return app.request(chemin, { method: "PATCH", headers: entetes(cookie), body: JSON.stringify(corps) });
}

export async function supprimer(app: AppTest, chemin: string, cookie?: string) {
  return app.request(chemin, { method: "DELETE", headers: entetes(cookie) });
}

export async function obtenir(app: AppTest, chemin: string, cookie?: string) {
  return app.request(chemin, { headers: cookie ? { Cookie: cookie } : {} });
}

export function extraireCookie(res: Response): string | undefined {
  return res.headers.get("set-cookie")?.split(";")[0];
}

export async function connexionTest(app: AppTest, identifiant: string): Promise<string> {
  const res = await poster(app, "/api/auth/connexion", { identifiant, motDePasse: MOT_DE_PASSE_TEST });
  const cookie = extraireCookie(res);
  if (!cookie) throw new Error(`Échec de connexion de test pour ${identifiant} (statut ${res.status})`);
  return cookie;
}

export async function json<T>(res: Response): Promise<T> {
  return (await res.json()) as T;
}
