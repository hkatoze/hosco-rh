import { Hono } from "hono";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "../../db";
import type { VariablesHono } from "../context";
import { obtenirIp } from "../ip";
import { exigeAuth, exigeRole, gardeChangementMotDePasse } from "../middlewares/auth";

export const routesServices = new Hono<{ Variables: VariablesHono }>();

const champObligatoire = "Ce champ est requis.";
const schemaCreationService = z.object({
  nom: z.string().trim().min(1, champObligatoire),
  code: z.string().trim().min(1, champObligatoire),
});
const schemaModificationService = z
  .object({
    nom: z.string().trim().min(1, champObligatoire),
    code: z.string().trim().min(1, champObligatoire),
    actif: z.boolean(),
  })
  .partial();

function reponseErreurZod(erreur: z.ZodError): { error: string; champ: string | null } {
  const premier = erreur.issues[0];
  return { error: premier?.message ?? "Données invalides.", champ: (premier?.path[0] as string | undefined) ?? null };
}

interface LigneService {
  id: string;
  nom: string;
  code: string;
  actif: boolean;
  agentsPresents: bigint;
}

routesServices.get("/", exigeAuth(), exigeRole("LECTURE"), gardeChangementMotDePasse(), async (c) => {
  const services = await prisma.$queryRaw<LigneService[]>`
    SELECT s."id", s."nom", s."code", s."actif",
           COUNT(*) FILTER (WHERE st."statut" = 'PRESENT') AS "agentsPresents"
    FROM "Service" s
    LEFT JOIN "Agent" a ON a."serviceId" = s."id" AND a."supprimeLe" IS NULL
    LEFT JOIN "AgentStatutCourant" st ON st."agentId" = a."id"
    WHERE s."actif" = true
    GROUP BY s."id", s."nom", s."code", s."actif"
    ORDER BY s."nom"
  `;

  return c.json(
    services.map((s) => ({
      id: s.id,
      nom: s.nom,
      code: s.code,
      actif: s.actif,
      agentsPresents: Number(s.agentsPresents),
    })),
  );
});

interface LigneServiceAdmin {
  id: string;
  nom: string;
  code: string;
  actif: boolean;
  effectif: bigint;
}

// Vue de gestion (Paramètres > Services) : tous les services, actifs ou
// non, avec l'effectif total (pas seulement les présents).
routesServices.get("/toutes", exigeAuth(), exigeRole("ADMIN"), gardeChangementMotDePasse(), async (c) => {
  const services = await prisma.$queryRaw<LigneServiceAdmin[]>`
    SELECT s."id", s."nom", s."code", s."actif",
           COUNT(a."id") FILTER (WHERE a."supprimeLe" IS NULL) AS "effectif"
    FROM "Service" s
    LEFT JOIN "Agent" a ON a."serviceId" = s."id"
    GROUP BY s."id", s."nom", s."code", s."actif"
    ORDER BY s."nom"
  `;

  return c.json(services.map((s) => ({ id: s.id, nom: s.nom, code: s.code, actif: s.actif, effectif: Number(s.effectif) })));
});

routesServices.post("/", exigeAuth(), exigeRole("ADMIN"), gardeChangementMotDePasse(), async (c) => {
  const corpsBrut = await c.req.json().catch(() => null);
  const analyse = schemaCreationService.safeParse(corpsBrut);
  if (!analyse.success) {
    return c.json(reponseErreurZod(analyse.error), 422);
  }

  const utilisateur = c.get("utilisateur");
  try {
    const service = await prisma.service.create({ data: analyse.data });
    await prisma.journal.create({
      data: {
        utilisateurId: utilisateur.id,
        action: "CREATION_SERVICE",
        cibleType: "Service",
        cibleId: service.id,
        detail: { nom: service.nom, code: service.code },
        adresseIp: obtenirIp(c),
      },
    });
    return c.json(service, 201);
  } catch (erreur) {
    if (erreur instanceof Prisma.PrismaClientKnownRequestError && erreur.code === "P2002") {
      return c.json({ error: "Ce code de service est déjà utilisé.", champ: "code" }, 409);
    }
    throw erreur;
  }
});

routesServices.patch("/:id", exigeAuth(), exigeRole("ADMIN"), gardeChangementMotDePasse(), async (c) => {
  const id = c.req.param("id");
  if (!z.string().uuid().safeParse(id).success) {
    return c.json({ error: "Identifiant invalide." }, 400);
  }

  const corpsBrut = await c.req.json().catch(() => null);
  const analyse = schemaModificationService.safeParse(corpsBrut);
  if (!analyse.success) {
    return c.json(reponseErreurZod(analyse.error), 422);
  }

  const existant = await prisma.service.findUnique({ where: { id } });
  if (!existant) {
    return c.json({ error: "Service introuvable." }, 404);
  }

  const utilisateur = c.get("utilisateur");
  try {
    const service = await prisma.service.update({ where: { id }, data: analyse.data });
    await prisma.journal.create({
      data: {
        utilisateurId: utilisateur.id,
        action: "MODIFICATION_SERVICE",
        cibleType: "Service",
        cibleId: id,
        detail: analyse.data,
        adresseIp: obtenirIp(c),
      },
    });
    return c.json(service);
  } catch (erreur) {
    if (erreur instanceof Prisma.PrismaClientKnownRequestError && erreur.code === "P2002") {
      return c.json({ error: "Ce code de service est déjà utilisé.", champ: "code" }, 409);
    }
    throw erreur;
  }
});

routesServices.delete("/:id", exigeAuth(), exigeRole("ADMIN"), gardeChangementMotDePasse(), async (c) => {
  const id = c.req.param("id");
  if (!z.string().uuid().safeParse(id).success) {
    return c.json({ error: "Identifiant invalide." }, 400);
  }

  const existant = await prisma.service.findUnique({ where: { id } });
  if (!existant) {
    return c.json({ error: "Service introuvable." }, 404);
  }

  const utilisateur = c.get("utilisateur");
  try {
    await prisma.service.delete({ where: { id } });
  } catch (erreur) {
    if (erreur instanceof Prisma.PrismaClientKnownRequestError && erreur.code === "P2003") {
      return c.json({ error: "Ce service a des agents rattachés : désactivez-le plutôt que de le supprimer." }, 409);
    }
    throw erreur;
  }

  await prisma.journal.create({
    data: {
      utilisateurId: utilisateur.id,
      action: "SUPPRESSION_SERVICE",
      cibleType: "Service",
      cibleId: id,
      detail: { nom: existant.nom, code: existant.code },
      adresseIp: obtenirIp(c),
    },
  });

  return c.json({ ok: true });
});
