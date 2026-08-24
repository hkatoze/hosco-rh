import type { RoleUtilisateur } from "@prisma/client";
import { getCookie, setCookie } from "hono/cookie";
import type { Context, MiddlewareHandler } from "hono";
import { prisma } from "../../db";
import {
  NOM_COOKIE,
  calculerNouvelleExpiration,
  doitRafraichir,
  hacherToken,
  sessionValide,
} from "../../domain/auth/session";
import { roleSuffisant } from "../../domain/auth/roles";
import { config } from "../../config";
import type { VariablesHono } from "../context";

type ContexteAuth = Context<{ Variables: VariablesHono }>;

/** Charge la session à partir du cookie ; rejette en 401 si absente, expirée, ou compte désactivé. */
export function exigeAuth(): MiddlewareHandler<{ Variables: VariablesHono }> {
  return async (c: ContexteAuth, next) => {
    const token = getCookie(c, NOM_COOKIE);
    if (!token) {
      return c.json({ error: "Authentification requise." }, 401);
    }

    const session = await prisma.session.findUnique({
      where: { tokenHash: hacherToken(token) },
      include: { utilisateur: true },
    });

    const maintenant = new Date();
    if (!session || !sessionValide(session, maintenant) || !session.utilisateur.actif) {
      return c.json({ error: "Authentification requise." }, 401);
    }

    if (doitRafraichir(session, maintenant)) {
      const nouvelleExpiration = calculerNouvelleExpiration(session, maintenant);
      await prisma.session.update({
        where: { id: session.id },
        data: { derniereActivite: maintenant, expireLe: nouvelleExpiration },
      });
      // Le cookie lui-même porte le plafond absolu, en simple filet de sécurité côté navigateur.
      setCookie(c, NOM_COOKIE, token, cookieOptions());
    }

    c.set("utilisateur", {
      id: session.utilisateur.id,
      identifiant: session.utilisateur.identifiant,
      nom: session.utilisateur.nom,
      role: session.utilisateur.role,
      actif: session.utilisateur.actif,
      doitChangerMotDePasse: session.utilisateur.doitChangerMotDePasse,
    });
    c.set("sessionId", session.id);

    await next();
  };
}

/** ADMIN > SAISIE > LECTURE : autorisé si le rôle courant couvre au moins un des rôles listés. */
export function exigeRole(...rolesAutorises: RoleUtilisateur[]): MiddlewareHandler<{ Variables: VariablesHono }> {
  return async (c: ContexteAuth, next) => {
    const utilisateur = c.get("utilisateur");
    const autorise = rolesAutorises.some((role) => roleSuffisant(utilisateur.role, role));
    if (!autorise) {
      return c.json({ error: "Accès refusé." }, 403);
    }
    await next();
  };
}

/** Bloque toute route tant que l'utilisateur doit changer son mot de passe. */
export function gardeChangementMotDePasse(): MiddlewareHandler<{ Variables: VariablesHono }> {
  return async (c: ContexteAuth, next) => {
    const utilisateur = c.get("utilisateur");
    if (utilisateur.doitChangerMotDePasse) {
      return c.json({ error: "Changement de mot de passe requis avant de continuer.", code: "MOT_DE_PASSE_A_CHANGER" }, 403);
    }
    await next();
  };
}

export function cookieOptions() {
  return {
    httpOnly: true,
    sameSite: "Strict" as const,
    path: "/",
    secure: config.cookieSecure,
    maxAge: 12 * 60 * 60,
  };
}
