import { Hono } from "hono";
import { Prisma, type RoleUtilisateur } from "@prisma/client";
import { z } from "zod";
import { prisma } from "../../db";
import { genererMotDePasseTemporaire, hacherMotDePasse } from "../../domain/auth/motDePasse";
import type { VariablesHono } from "../context";
import { obtenirIp } from "../ip";
import { exigeAuth, exigeRole, gardeChangementMotDePasse } from "../middlewares/auth";

const schemaParamId = z.object({ id: z.string().uuid() });

const ROLES: [RoleUtilisateur, ...RoleUtilisateur[]] = ["LECTURE", "SAISIE", "ADMIN"];
const champObligatoire = "Ce champ est requis.";
const schemaCreationUtilisateur = z.object({
  identifiant: z.string().trim().min(1, champObligatoire),
  nom: z.string().trim().min(1, champObligatoire),
  role: z.enum(ROLES, { errorMap: () => ({ message: "Sélectionnez un rôle." }) }),
});
const schemaModificationUtilisateur = z
  .object({
    nom: z.string().trim().min(1, champObligatoire),
    role: z.enum(ROLES),
    actif: z.boolean(),
  })
  .partial();

function reponseErreurZod(erreur: z.ZodError): { error: string; champ: string | null } {
  const premier = erreur.issues[0];
  return { error: premier?.message ?? "Données invalides.", champ: (premier?.path[0] as string | undefined) ?? null };
}

export const routesUtilisateurs = new Hono<{ Variables: VariablesHono }>();

const SELECTION_PUBLIQUE = {
  id: true,
  identifiant: true,
  nom: true,
  role: true,
  actif: true,
  doitChangerMotDePasse: true,
  dernierAcces: true,
  createdAt: true,
} as const;

routesUtilisateurs.get("/", exigeAuth(), exigeRole("ADMIN"), gardeChangementMotDePasse(), async (c) => {
  const utilisateurs = await prisma.utilisateur.findMany({
    select: SELECTION_PUBLIQUE,
    orderBy: { nom: "asc" },
  });
  return c.json(utilisateurs);
});

routesUtilisateurs.post("/", exigeAuth(), exigeRole("ADMIN"), gardeChangementMotDePasse(), async (c) => {
  const corpsBrut = await c.req.json().catch(() => null);
  const analyse = schemaCreationUtilisateur.safeParse(corpsBrut);
  if (!analyse.success) {
    return c.json(reponseErreurZod(analyse.error), 422);
  }
  const { identifiant, nom, role } = analyse.data;

  const motDePasseTemporaire = genererMotDePasseTemporaire();
  const hash = await hacherMotDePasse(motDePasseTemporaire);
  const admin = c.get("utilisateur");

  try {
    const utilisateur = await prisma.$transaction(async (tx) => {
      const cree = await tx.utilisateur.create({
        data: { identifiant, nom, role, motDePasseHash: hash, actif: true, doitChangerMotDePasse: true },
        select: SELECTION_PUBLIQUE,
      });
      await tx.journal.create({
        data: {
          utilisateurId: admin.id,
          action: "CREATION_UTILISATEUR",
          cibleType: "Utilisateur",
          cibleId: cree.id,
          detail: { identifiant: cree.identifiant, role: cree.role },
          adresseIp: obtenirIp(c),
        },
      });
      return cree;
    });
    return c.json({ ...utilisateur, motDePasseTemporaire }, 201);
  } catch (erreur) {
    if (erreur instanceof Prisma.PrismaClientKnownRequestError && erreur.code === "P2002") {
      return c.json({ error: "Cet identifiant est déjà utilisé.", champ: "identifiant" }, 409);
    }
    throw erreur;
  }
});

routesUtilisateurs.patch("/:id", exigeAuth(), exigeRole("ADMIN"), gardeChangementMotDePasse(), async (c) => {
  const analyseParam = schemaParamId.safeParse({ id: c.req.param("id") });
  if (!analyseParam.success) {
    return c.json({ error: "Identifiant invalide." }, 400);
  }

  const corpsBrut = await c.req.json().catch(() => null);
  const analyse = schemaModificationUtilisateur.safeParse(corpsBrut);
  if (!analyse.success) {
    return c.json(reponseErreurZod(analyse.error), 422);
  }

  const existant = await prisma.utilisateur.findUnique({ where: { id: analyseParam.data.id } });
  if (!existant) {
    return c.json({ error: "Utilisateur introuvable." }, 404);
  }

  const admin = c.get("utilisateur");
  if (existant.id === admin.id && analyse.data.actif === false) {
    return c.json({ error: "Vous ne pouvez pas désactiver votre propre compte.", champ: "actif" }, 422);
  }

  const utilisateur = await prisma.$transaction(async (tx) => {
    const misAJour = await tx.utilisateur.update({ where: { id: existant.id }, data: analyse.data, select: SELECTION_PUBLIQUE });
    await tx.journal.create({
      data: {
        utilisateurId: admin.id,
        action: "MODIFICATION_UTILISATEUR",
        cibleType: "Utilisateur",
        cibleId: existant.id,
        detail: analyse.data,
        adresseIp: obtenirIp(c),
      },
    });
    return misAJour;
  });

  return c.json(utilisateur);
});

routesUtilisateurs.post(
  "/:id/reinitialiser-mot-de-passe",
  exigeAuth(),
  exigeRole("ADMIN"),
  gardeChangementMotDePasse(),
  async (c) => {
    const analyseParam = schemaParamId.safeParse({ id: c.req.param("id") });
    if (!analyseParam.success) {
      return c.json({ error: "Identifiant invalide." }, 400);
    }

    const cible = await prisma.utilisateur.findUnique({ where: { id: analyseParam.data.id } });
    if (!cible) {
      return c.json({ error: "Utilisateur introuvable." }, 404);
    }

    const motDePasseTemporaire = genererMotDePasseTemporaire();
    const hash = await hacherMotDePasse(motDePasseTemporaire);

    await prisma.utilisateur.update({
      where: { id: cible.id },
      data: { motDePasseHash: hash, doitChangerMotDePasse: true },
    });
    // Le compte devra de toute façon re-choisir un mot de passe : autant
    // forcer aussi la reconnexion de toute session déjà ouverte.
    await prisma.session.deleteMany({ where: { utilisateurId: cible.id } });

    const admin = c.get("utilisateur");
    await prisma.journal.create({
      data: {
        utilisateurId: admin.id,
        action: "REINITIALISATION_MOT_DE_PASSE",
        cibleType: "Utilisateur",
        cibleId: cible.id,
        adresseIp: obtenirIp(c),
      },
    });

    return c.json({ motDePasseTemporaire });
  },
);
