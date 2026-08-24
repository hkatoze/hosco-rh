import { Hono } from "hono";
import { deleteCookie, setCookie } from "hono/cookie";
import { z } from "zod";
import { prisma } from "../../db";
import {
  LONGUEUR_MOT_DE_PASSE_MIN,
  hacherMotDePasse,
  verifierMotDePasse,
  verifierMotDePasseFactice,
} from "../../domain/auth/motDePasse";
import { limiteurConnexion } from "../../domain/auth/limiteurConnexion";
import {
  NOM_COOKIE,
  calculerNouvelleExpiration,
  genererToken,
  hacherToken,
} from "../../domain/auth/session";
import type { VariablesHono } from "../context";
import { obtenirIp } from "../ip";
import { cookieOptions, exigeAuth, gardeChangementMotDePasse } from "../middlewares/auth";

const MESSAGE_IDENTIFIANTS_INVALIDES = "Identifiant ou mot de passe incorrect.";

const schemaConnexion = z.object({
  identifiant: z.string().min(1),
  motDePasse: z.string().min(1),
});

const schemaChangementMotDePasse = z.object({
  ancien: z.string().min(1),
  nouveau: z
    .string()
    .min(LONGUEUR_MOT_DE_PASSE_MIN, `Le mot de passe doit contenir au moins ${LONGUEUR_MOT_DE_PASSE_MIN} caractères.`),
});

export const routesAuth = new Hono<{ Variables: VariablesHono }>();

routesAuth.post("/connexion", async (c) => {
  const corpsBrut = await c.req.json().catch(() => null);
  const analyse = schemaConnexion.safeParse(corpsBrut);
  if (!analyse.success) {
    return c.json({ error: "Requête invalide." }, 400);
  }
  const { identifiant, motDePasse } = analyse.data;
  const ip = obtenirIp(c);
  const maintenant = new Date();

  if (limiteurConnexion.estBloque(identifiant, ip, maintenant)) {
    return c.json({ error: "Trop de tentatives. Réessayez dans quelques minutes." }, 429);
  }

  const utilisateur = await prisma.utilisateur.findUnique({ where: { identifiant } });

  // Comparaison à temps constant : une vérification argon2 (factice si le
  // compte n'existe pas) a toujours lieu, pour ne pas fuiter l'existence
  // du compte par le temps de réponse.
  const motDePasseValide = utilisateur
    ? await verifierMotDePasse(utilisateur.motDePasseHash, motDePasse)
    : await verifierMotDePasseFactice(motDePasse).then(() => false);

  if (!utilisateur || !utilisateur.actif || !motDePasseValide) {
    const vientDeBloquer = limiteurConnexion.enregistrerEchec(identifiant, ip, maintenant);
    await prisma.journal.create({
      data: {
        utilisateurId: utilisateur?.id ?? null,
        action: "CONNEXION_ECHEC",
        cibleType: "Utilisateur",
        detail: { identifiantTente: identifiant },
        adresseIp: ip,
      },
    });
    if (vientDeBloquer) {
      await prisma.journal.create({
        data: {
          utilisateurId: utilisateur?.id ?? null,
          action: "BLOCAGE_TENTATIVES",
          cibleType: "Utilisateur",
          detail: { identifiantTente: identifiant },
          adresseIp: ip,
        },
      });
    }
    return c.json({ error: MESSAGE_IDENTIFIANTS_INVALIDES }, 401);
  }

  limiteurConnexion.reinitialiser(identifiant, ip);

  const token = genererToken();
  const expireLe = calculerNouvelleExpiration({ createdAt: maintenant }, maintenant);
  await prisma.session.create({
    data: {
      tokenHash: hacherToken(token),
      utilisateurId: utilisateur.id,
      expireLe,
      derniereActivite: maintenant,
      adresseIp: ip,
      userAgent: c.req.header("user-agent") ?? null,
    },
  });

  await prisma.utilisateur.update({ where: { id: utilisateur.id }, data: { dernierAcces: maintenant } });
  await prisma.journal.create({
    data: {
      utilisateurId: utilisateur.id,
      action: "CONNEXION",
      cibleType: "Utilisateur",
      adresseIp: ip,
    },
  });

  setCookie(c, NOM_COOKIE, token, cookieOptions());

  return c.json({
    id: utilisateur.id,
    identifiant: utilisateur.identifiant,
    nom: utilisateur.nom,
    role: utilisateur.role,
    doitChangerMotDePasse: utilisateur.doitChangerMotDePasse,
  });
});

routesAuth.post("/deconnexion", exigeAuth(), gardeChangementMotDePasse(), async (c) => {
  const sessionId = c.get("sessionId");
  const utilisateur = c.get("utilisateur");

  await prisma.session.delete({ where: { id: sessionId } });
  deleteCookie(c, NOM_COOKIE, { path: "/" });

  await prisma.journal.create({
    data: {
      utilisateurId: utilisateur.id,
      action: "DECONNEXION",
      cibleType: "Utilisateur",
      adresseIp: obtenirIp(c),
    },
  });

  return c.json({ ok: true });
});

routesAuth.get("/moi", exigeAuth(), async (c) => {
  return c.json(c.get("utilisateur"));
});

routesAuth.post("/mot-de-passe", exigeAuth(), async (c) => {
  const corpsBrut = await c.req.json().catch(() => null);
  const analyse = schemaChangementMotDePasse.safeParse(corpsBrut);
  if (!analyse.success) {
    return c.json({ error: analyse.error.issues[0]?.message ?? "Requête invalide." }, 400);
  }
  const { ancien, nouveau } = analyse.data;
  const utilisateurConnecte = c.get("utilisateur");

  const utilisateur = await prisma.utilisateur.findUniqueOrThrow({ where: { id: utilisateurConnecte.id } });
  const ancienValide = await verifierMotDePasse(utilisateur.motDePasseHash, ancien);
  if (!ancienValide) {
    return c.json({ error: "Ancien mot de passe incorrect." }, 400);
  }

  const nouveauHash = await hacherMotDePasse(nouveau);
  await prisma.utilisateur.update({
    where: { id: utilisateur.id },
    data: { motDePasseHash: nouveauHash, doitChangerMotDePasse: false },
  });

  // Invalide les autres sessions (vol de session), garde la session courante active.
  const sessionId = c.get("sessionId");
  await prisma.session.deleteMany({ where: { utilisateurId: utilisateur.id, id: { not: sessionId } } });

  await prisma.journal.create({
    data: {
      utilisateurId: utilisateur.id,
      action: "CHANGEMENT_MOT_DE_PASSE",
      cibleType: "Utilisateur",
      adresseIp: obtenirIp(c),
    },
  });

  return c.json({ ok: true });
});
