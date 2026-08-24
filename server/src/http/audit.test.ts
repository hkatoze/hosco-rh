import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { config } from "../config";
import { prisma } from "../db";
import { hacherMotDePasse } from "../domain/auth/motDePasse";
import { LimiteurConnexion, limiteurConnexion } from "../domain/auth/limiteurConnexion";
import { NOM_COOKIE } from "../domain/auth/session";
import { creerApp } from "./app";

/**
 * Suite d'audit indépendante : chaque test correspond à un point du rapport
 * de sécurité demandé. Ne remplace pas auth.test.ts (tests fonctionnels),
 * sert de preuve écrite pour chaque constat.
 */

const ORIGINE = "http://localhost:5173";
const app = creerApp();

interface CorpsErreur {
  error?: string;
  code?: string;
}
interface CorpsUtilisateur {
  id: string;
  identifiant: string;
}

function entetes(cookie?: string): Record<string, string> {
  const en: Record<string, string> = { "Content-Type": "application/json", Origin: ORIGINE };
  if (cookie) en.Cookie = cookie;
  return en;
}

async function poster(chemin: string, corps: unknown, cookie?: string) {
  return app.request(chemin, { method: "POST", headers: entetes(cookie), body: JSON.stringify(corps) });
}

function extraireCookie(res: Response): string | undefined {
  return res.headers.get("set-cookie")?.split(";")[0];
}

async function json<T>(res: Response): Promise<T> {
  return (await res.json()) as T;
}

describe("Audit authentification", () => {
  const identifiantTest = `audit.saisie.${randomUUID().slice(0, 8)}`;
  const identifiantAdmin = `audit.admin.${randomUUID().slice(0, 8)}`;
  const identifiantInconnu = `audit.inconnu.${randomUUID().slice(0, 8)}`;
  const motDePasseTest = "MotDePasseValide1";
  let utilisateurId: string;
  let adminId: string;

  beforeEach(async () => {
    limiteurConnexion.reinitialiserTout();
    const hash = await hacherMotDePasse(motDePasseTest);
    const u = await prisma.utilisateur.create({
      data: {
        identifiant: identifiantTest,
        nom: "Audit Saisie",
        motDePasseHash: hash,
        role: "SAISIE",
        actif: true,
        doitChangerMotDePasse: false,
      },
    });
    utilisateurId = u.id;
    const a = await prisma.utilisateur.create({
      data: {
        identifiant: identifiantAdmin,
        nom: "Audit Admin",
        motDePasseHash: hash,
        role: "ADMIN",
        actif: true,
        doitChangerMotDePasse: false,
      },
    });
    adminId = a.id;
  });

  afterEach(async () => {
    await prisma.session.deleteMany({ where: { utilisateurId: { in: [utilisateurId, adminId] } } });
    await prisma.journal.deleteMany({
      where: {
        OR: [
          { utilisateurId: { in: [utilisateurId, adminId] } },
          // Le test du point 5 suffixe identifiantInconnu (.0, .1, ...) à chaque itération.
          { detail: { path: ["identifiantTente"], string_starts_with: identifiantInconnu } },
          // Le test du point 6 tente identifiantTest en majuscules.
          { detail: { path: ["identifiantTente"], equals: identifiantTest.toUpperCase() } },
        ],
      },
    });
    await prisma.utilisateur.deleteMany({ where: { id: { in: [utilisateurId, adminId] } } });
    config.cookieSecure = false;
  });

  // ---------------------------------------------------------------------
  // 1. Le token en clair n'existe nulle part hors du cookie
  // ---------------------------------------------------------------------
  describe("1. Confinement du token", () => {
    it("aucune colonne de la ligne Session ne contient le token en clair", async () => {
      const res = await poster("/api/auth/connexion", { identifiant: identifiantTest, motDePasse: motDePasseTest });
      const cookie = extraireCookie(res)!;
      const token = decodeURIComponent(cookie.split("=")[1]!);
      expect(token.length).toBeGreaterThan(20);

      const session = await prisma.session.findFirstOrThrow({ where: { utilisateurId } });
      const colonnes = Object.entries(session).filter(([cle]) => cle !== "id" && cle !== "utilisateurId");
      for (const [cle, valeur] of colonnes) {
        const texte = valeur instanceof Date ? valeur.toISOString() : String(valeur);
        expect(texte, `la colonne "${cle}" ne doit pas contenir le token`).not.toContain(token);
      }
      expect(session.tokenHash).not.toBe(token);
    });

    it("la réponse de connexion ne contient pas le token dans le corps JSON", async () => {
      const res = await poster("/api/auth/connexion", { identifiant: identifiantTest, motDePasse: motDePasseTest });
      const cookie = extraireCookie(res)!;
      const token = decodeURIComponent(cookie.split("=")[1]!);
      const corpsTexte = JSON.stringify(await json<CorpsUtilisateur>(res));
      expect(corpsTexte).not.toContain(token);
    });
  });

  // ---------------------------------------------------------------------
  // 2. Protection du cookie
  // ---------------------------------------------------------------------
  describe("2. Attributs du cookie", () => {
    it("Set-Cookie porte HttpOnly, SameSite=Strict, Path=/, sans Secure en dev", async () => {
      const res = await poster("/api/auth/connexion", { identifiant: identifiantTest, motDePasse: motDePasseTest });
      const setCookie = res.headers.get("set-cookie")!;
      expect(setCookie).toMatch(/HttpOnly/i);
      expect(setCookie).toMatch(/SameSite=Strict/i);
      expect(setCookie).toMatch(/Path=\//);
      expect(setCookie).not.toMatch(/;\s*Secure/i);
    });

    it("Set-Cookie porte Secure quand COOKIE_SECURE=true (config production)", async () => {
      config.cookieSecure = true;
      const res = await poster("/api/auth/connexion", { identifiant: identifiantTest, motDePasse: motDePasseTest });
      const setCookie = res.headers.get("set-cookie")!;
      expect(setCookie).toMatch(/;\s*Secure/i);
    });
  });

  // ---------------------------------------------------------------------
  // 3. La déconnexion invalide réellement la session côté serveur
  // ---------------------------------------------------------------------
  describe("3. Invalidation serveur à la déconnexion", () => {
    it("le token réutilisé après déconnexion est rejeté et la ligne Session a disparu", async () => {
      const connexion = await poster("/api/auth/connexion", { identifiant: identifiantTest, motDePasse: motDePasseTest });
      const cookie = extraireCookie(connexion)!;
      const token = decodeURIComponent(cookie.split("=")[1]!);

      expect(await prisma.session.findFirst({ where: { utilisateurId } })).not.toBeNull();

      const resDeco = await poster("/api/auth/deconnexion", {}, cookie);
      expect(resDeco.status).toBe(200);

      expect(await prisma.session.findFirst({ where: { utilisateurId } })).toBeNull();

      const rejeu = await app.request("/api/auth/moi", { headers: { Cookie: `${NOM_COOKIE}=${token}` } });
      expect(rejeu.status).toBe(401);
    });
  });

  // ---------------------------------------------------------------------
  // 4. Contrôle d'accès route par route (preuve comportementale)
  // ---------------------------------------------------------------------
  describe("4. Contrôle d'accès par route", () => {
    it("POST /api/auth/connexion ne nécessite pas de session (route publique attendue)", async () => {
      const res = await poster("/api/auth/connexion", { identifiant: identifiantTest, motDePasse: motDePasseTest });
      expect(res.status).toBe(200);
    });

    it("POST /api/auth/deconnexion sans cookie -> 401", async () => {
      const res = await poster("/api/auth/deconnexion", {});
      expect(res.status).toBe(401);
    });

    it("GET /api/auth/moi sans cookie -> 401", async () => {
      const res = await app.request("/api/auth/moi", { headers: entetes() });
      expect(res.status).toBe(401);
    });

    it("POST /api/auth/mot-de-passe sans cookie -> 401", async () => {
      const res = await poster("/api/auth/mot-de-passe", { ancien: "x", nouveau: "y".repeat(9) });
      expect(res.status).toBe(401);
    });

    it("POST /api/utilisateurs/:id/reinitialiser-mot-de-passe sans cookie -> 401", async () => {
      const res = await poster(`/api/utilisateurs/${utilisateurId}/reinitialiser-mot-de-passe`, {});
      expect(res.status).toBe(401);
    });

    it("un rôle SAISIE ne peut pas réinitialiser un mot de passe -> 403", async () => {
      const connexion = await poster("/api/auth/connexion", { identifiant: identifiantTest, motDePasse: motDePasseTest });
      const cookie = extraireCookie(connexion)!;
      const res = await poster(`/api/utilisateurs/${utilisateurId}/reinitialiser-mot-de-passe`, {}, cookie);
      expect(res.status).toBe(403);
    });

    it("un rôle ADMIN peut réinitialiser un mot de passe -> 200", async () => {
      const connexion = await poster("/api/auth/connexion", { identifiant: identifiantAdmin, motDePasse: motDePasseTest });
      const cookie = extraireCookie(connexion)!;
      const res = await poster(`/api/utilisateurs/${utilisateurId}/reinitialiser-mot-de-passe`, {}, cookie);
      expect(res.status).toBe(200);
    });
  });

  // ---------------------------------------------------------------------
  // 5. Temps de réponse identifiant inconnu vs mot de passe faux
  // ---------------------------------------------------------------------
  describe("5. Temps de réponse constant", () => {
    it("le temps moyen est comparable entre identifiant inconnu et mot de passe faux", async () => {
      // argon2 est volontairement coûteux (~150-200ms/appel) ; 2×15 appels
      // dépassent le timeout par défaut de Vitest (5s).
      const REPETITIONS = 15;
      const tempsInconnu: number[] = [];
      const tempsMauvaisMdp: number[] = [];

      for (let i = 0; i < REPETITIONS; i++) {
        limiteurConnexion.reinitialiserTout();
        const debut1 = Date.now();
        await poster("/api/auth/connexion", { identifiant: `${identifiantInconnu}.${i}`, motDePasse: "peu-importe" });
        tempsInconnu.push(Date.now() - debut1);

        limiteurConnexion.reinitialiserTout();
        const debut2 = Date.now();
        await poster("/api/auth/connexion", { identifiant: identifiantTest, motDePasse: "mauvais-mot-de-passe" });
        tempsMauvaisMdp.push(Date.now() - debut2);
      }

      const moyenne = (arr: number[]) => arr.reduce((a, b) => a + b, 0) / arr.length;
      const moyenneInconnu = moyenne(tempsInconnu);
      const moyenneMauvaisMdp = moyenne(tempsMauvaisMdp);
      const ecartRelatif = Math.abs(moyenneInconnu - moyenneMauvaisMdp) / Math.max(moyenneInconnu, moyenneMauvaisMdp);

      console.log(
        `[audit] identifiant inconnu: ${moyenneInconnu.toFixed(1)}ms — mot de passe faux: ${moyenneMauvaisMdp.toFixed(1)}ms — écart relatif: ${(ecartRelatif * 100).toFixed(1)}%`,
      );

      // Seuil large : mesure de bout en bout (HTTP+DB+argon2), pas une preuve
      // cryptographique de temps constant — juste l'absence d'oracle grossier.
      expect(ecartRelatif).toBeLessThan(0.4);
    }, 30000);
  });

  // ---------------------------------------------------------------------
  // 6. Limiteur par identifiant + IP, résistance casse/espaces
  // ---------------------------------------------------------------------
  describe("6. Limiteur de tentatives", () => {
    it("deux IP distinctes ont des compteurs indépendants pour le même identifiant", () => {
      const limiteur = new LimiteurConnexion();
      const t0 = new Date();
      for (let i = 0; i < 5; i++) limiteur.enregistrerEchec("admin.rh", "10.0.0.1", t0);
      expect(limiteur.estBloque("admin.rh", "10.0.0.1", t0)).toBe(true);
      expect(limiteur.estBloque("admin.rh", "10.0.0.2", t0)).toBe(false);
    });

    it("la casse de l'identifiant ne permet pas d'échapper au compteur", () => {
      const limiteur = new LimiteurConnexion();
      const t0 = new Date();
      for (let i = 0; i < 5; i++) limiteur.enregistrerEchec("Admin.RH", "10.0.0.1", t0);
      expect(limiteur.estBloque("admin.rh", "10.0.0.1", t0)).toBe(true);
    });

    it("[NON CONFORME] un espace ajouté à l'identifiant échappe au compteur", () => {
      const limiteur = new LimiteurConnexion();
      const t0 = new Date();
      for (let i = 0; i < 5; i++) limiteur.enregistrerEchec("admin.rh", "10.0.0.1", t0);
      expect(limiteur.estBloque("admin.rh", "10.0.0.1", t0)).toBe(true);
      // Ce test documente le bug : il devrait être bloqué aussi, il ne l'est pas.
      expect(limiteur.estBloque("admin.rh ", "10.0.0.1", t0)).toBe(false);
    });

    it("un identifiant à la casse modifiée ne correspond à aucun compte réel (Prisma est sensible à la casse)", async () => {
      const res = await poster("/api/auth/connexion", {
        identifiant: identifiantTest.toUpperCase(),
        motDePasse: motDePasseTest,
      });
      expect(res.status).toBe(401);
      expect(await prisma.session.count({ where: { utilisateurId } })).toBe(0);
    });
  });

  // ---------------------------------------------------------------------
  // 7. La garde doitChangerMotDePasse s'applique à une route quelconque
  // ---------------------------------------------------------------------
  describe("7. Garde doitChangerMotDePasse", () => {
    it("bloque une route ADMIN (reinitialiser-mot-de-passe) quand doitChangerMotDePasse=true", async () => {
      await prisma.utilisateur.update({ where: { id: adminId }, data: { doitChangerMotDePasse: true } });
      const connexion = await poster("/api/auth/connexion", { identifiant: identifiantAdmin, motDePasse: motDePasseTest });
      const cookie = extraireCookie(connexion)!;

      const res = await poster(`/api/utilisateurs/${utilisateurId}/reinitialiser-mot-de-passe`, {}, cookie);
      expect(res.status).toBe(403);
      expect((await json<CorpsErreur>(res)).code).toBe("MOT_DE_PASSE_A_CHANGER");
    });

    it("laisse passer /moi et /mot-de-passe pour ce même compte", async () => {
      await prisma.utilisateur.update({ where: { id: adminId }, data: { doitChangerMotDePasse: true } });
      const connexion = await poster("/api/auth/connexion", { identifiant: identifiantAdmin, motDePasse: motDePasseTest });
      const cookie = extraireCookie(connexion)!;

      const resMoi = await app.request("/api/auth/moi", { headers: { Cookie: cookie } });
      expect(resMoi.status).toBe(200);

      const resMdp = await poster("/api/auth/mot-de-passe", { ancien: motDePasseTest, nouveau: "AutreMotDePasse1" }, cookie);
      expect(resMdp.status).toBe(200);
    });
  });
});
