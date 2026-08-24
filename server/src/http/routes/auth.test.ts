import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "../../db";
import { hacherMotDePasse } from "../../domain/auth/motDePasse";
import { limiteurConnexion } from "../../domain/auth/limiteurConnexion";
import { creerApp } from "../app";

const ORIGINE = "http://localhost:5173";
const app = creerApp();

interface CorpsErreur {
  error?: string;
  code?: string;
}

interface CorpsUtilisateur {
  id: string;
  identifiant: string;
  nom: string;
  role: string;
  doitChangerMotDePasse: boolean;
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

describe("routes /api/auth", () => {
  const identifiantTest = `test.auth.${randomUUID().slice(0, 8)}`;
  const identifiantInconnu = `test.inconnu.${randomUUID().slice(0, 8)}`;
  const motDePasseTest = "MotDePasseValide1";
  let utilisateurId: string;

  beforeEach(async () => {
    limiteurConnexion.reinitialiserTout();
    const hash = await hacherMotDePasse(motDePasseTest);
    const u = await prisma.utilisateur.create({
      data: {
        identifiant: identifiantTest,
        nom: "Utilisateur Test",
        motDePasseHash: hash,
        role: "SAISIE",
        actif: true,
        doitChangerMotDePasse: false,
      },
    });
    utilisateurId = u.id;
  });

  afterEach(async () => {
    await prisma.session.deleteMany({ where: { utilisateurId } });
    await prisma.journal.deleteMany({
      where: {
        OR: [
          { utilisateurId },
          { detail: { path: ["identifiantTente"], equals: identifiantTest } },
          { detail: { path: ["identifiantTente"], equals: identifiantInconnu } },
        ],
      },
    });
    await prisma.utilisateur.deleteMany({ where: { id: utilisateurId } });
  });

  it("connexion réussie renvoie l'utilisateur, pose le cookie et journalise CONNEXION", async () => {
    const res = await poster("/api/auth/connexion", { identifiant: identifiantTest, motDePasse: motDePasseTest });
    expect(res.status).toBe(200);
    const corps = await json<CorpsUtilisateur>(res);
    expect(corps.identifiant).toBe(identifiantTest);
    expect(extraireCookie(res)).toMatch(/^hosco_session=/);

    const journal = await prisma.journal.findFirst({ where: { utilisateurId, action: "CONNEXION" } });
    expect(journal).not.toBeNull();
    expect(journal?.cibleId).toBeNull();

    const utilisateur = await prisma.utilisateur.findUniqueOrThrow({ where: { id: utilisateurId } });
    expect(utilisateur.dernierAcces).not.toBeNull();
  });

  it("mauvais mot de passe -> 401, message générique, journalise CONNEXION_ECHEC", async () => {
    const res = await poster("/api/auth/connexion", { identifiant: identifiantTest, motDePasse: "mauvais-mdp" });
    expect(res.status).toBe(401);
    const corps = await json<CorpsErreur>(res);
    expect(corps.error).toBe("Identifiant ou mot de passe incorrect.");

    const journal = await prisma.journal.findFirst({ where: { utilisateurId, action: "CONNEXION_ECHEC" } });
    expect(journal).not.toBeNull();
  });

  it("identifiant inconnu -> même statut et même message générique", async () => {
    const res = await poster("/api/auth/connexion", { identifiant: identifiantInconnu, motDePasse: "peu-importe" });
    expect(res.status).toBe(401);
    const corps = await json<CorpsErreur>(res);
    expect(corps.error).toBe("Identifiant ou mot de passe incorrect.");

    const journal = await prisma.journal.findFirst({
      where: { action: "CONNEXION_ECHEC", detail: { path: ["identifiantTente"], equals: identifiantInconnu } },
    });
    expect(journal).not.toBeNull();
    expect(journal?.utilisateurId).toBeNull();
  });

  it("compte inactif -> refusé avec le même message générique", async () => {
    await prisma.utilisateur.update({ where: { id: utilisateurId }, data: { actif: false } });
    const res = await poster("/api/auth/connexion", { identifiant: identifiantTest, motDePasse: motDePasseTest });
    expect(res.status).toBe(401);
    const corps = await json<CorpsErreur>(res);
    expect(corps.error).toBe("Identifiant ou mot de passe incorrect.");
  });

  it("bloque après 5 échecs (identifiant+IP) et journalise BLOCAGE_TENTATIVES", async () => {
    for (let i = 0; i < 5; i++) {
      await poster("/api/auth/connexion", { identifiant: identifiantTest, motDePasse: "mauvais" });
    }
    const res = await poster("/api/auth/connexion", { identifiant: identifiantTest, motDePasse: motDePasseTest });
    expect(res.status).toBe(429);

    const blocage = await prisma.journal.findFirst({ where: { utilisateurId, action: "BLOCAGE_TENTATIVES" } });
    expect(blocage).not.toBeNull();
  });

  it("GET /api/auth/moi renvoie l'utilisateur courant après connexion, 401 sans cookie", async () => {
    const connexion = await poster("/api/auth/connexion", { identifiant: identifiantTest, motDePasse: motDePasseTest });
    const cookie = extraireCookie(connexion);

    const res = await app.request("/api/auth/moi", { headers: cookie ? { Cookie: cookie } : {} });
    expect(res.status).toBe(200);
    expect((await json<CorpsUtilisateur>(res)).identifiant).toBe(identifiantTest);

    const sansCookie = await app.request("/api/auth/moi");
    expect(sansCookie.status).toBe(401);
  });

  it("déconnexion supprime la session côté serveur (pas seulement le cookie)", async () => {
    const connexion = await poster("/api/auth/connexion", { identifiant: identifiantTest, motDePasse: motDePasseTest });
    const cookie = extraireCookie(connexion)!;

    const resDeco = await poster("/api/auth/deconnexion", {}, cookie);
    expect(resDeco.status).toBe(200);
    expect(await prisma.session.count({ where: { utilisateurId } })).toBe(0);

    const resApres = await app.request("/api/auth/moi", { headers: { Cookie: cookie } });
    expect(resApres.status).toBe(401);
  });

  it("bloque les routes (sauf /moi et /mot-de-passe) quand doitChangerMotDePasse=true", async () => {
    await prisma.utilisateur.update({ where: { id: utilisateurId }, data: { doitChangerMotDePasse: true } });
    const connexion = await poster("/api/auth/connexion", { identifiant: identifiantTest, motDePasse: motDePasseTest });
    const cookie = extraireCookie(connexion)!;

    const resMoi = await app.request("/api/auth/moi", { headers: { Cookie: cookie } });
    expect(resMoi.status).toBe(200);

    const resDeco = await poster("/api/auth/deconnexion", {}, cookie);
    expect(resDeco.status).toBe(403);
    expect((await json<CorpsErreur>(resDeco)).code).toBe("MOT_DE_PASSE_A_CHANGER");
  });

  it("changement de mot de passe réussi lève la garde et invalide les autres sessions", async () => {
    await prisma.utilisateur.update({ where: { id: utilisateurId }, data: { doitChangerMotDePasse: true } });
    const connexionA = await poster("/api/auth/connexion", { identifiant: identifiantTest, motDePasse: motDePasseTest });
    const cookieA = extraireCookie(connexionA)!;
    const connexionB = await poster("/api/auth/connexion", { identifiant: identifiantTest, motDePasse: motDePasseTest });
    const cookieB = extraireCookie(connexionB)!;

    const res = await poster(
      "/api/auth/mot-de-passe",
      { ancien: motDePasseTest, nouveau: "NouveauMotDePasse1" },
      cookieA,
    );
    expect(res.status).toBe(200);

    const utilisateur = await prisma.utilisateur.findUniqueOrThrow({ where: { id: utilisateurId } });
    expect(utilisateur.doitChangerMotDePasse).toBe(false);

    const resA = await app.request("/api/auth/moi", { headers: { Cookie: cookieA } });
    expect(resA.status).toBe(200);

    const resB = await app.request("/api/auth/moi", { headers: { Cookie: cookieB } });
    expect(resB.status).toBe(401);
  });

  it("rejette une connexion POST avec une Origin étrangère", async () => {
    const res = await app.request("/api/auth/connexion", {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: "https://malveillant.example" },
      body: JSON.stringify({ identifiant: identifiantTest, motDePasse: motDePasseTest }),
    });
    expect(res.status).toBe(403);
  });
});
