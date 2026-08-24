import { Hono } from "hono";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "../../db";
import { dateDuJour, statutAgent } from "../../domain/statut";
import { TYPES_MOUVEMENT } from "../../../../shared/mouvement";
import type { VariablesHono } from "../context";
import { obtenirIp } from "../ip";
import { exigeAuth, exigeRole, gardeChangementMotDePasse } from "../middlewares/auth";

export const routesMouvements = new Hono<{ Variables: VariablesHono }>();

const schemaAnnulation = z.object({
  motif: z.string().trim().min(10, "Le motif d'annulation doit contenir au moins 10 caractères."),
});

const schemaListeMouvements = z.object({
  q: z.string().trim().min(1).optional(),
  type: z.enum(TYPES_MOUVEMENT).optional(),
  serviceId: z.string().uuid().optional(),
  dateDebut: z.coerce.date().optional(),
  dateFin: z.coerce.date().optional(),
  inclureAnnules: z.coerce.boolean().default(false),
  page: z.coerce.number().int().min(1).default(1),
  taille: z.coerce
    .number()
    .int()
    .min(1)
    .default(25)
    .transform((v) => Math.min(v, 100)),
});

interface LigneMouvement {
  id: string;
  type: string;
  dateEffet: Date;
  dateFin: Date | null;
  motif: string | null;
  createdAt: Date;
  annuleLe: Date | null;
  motifAnnulation: string | null;
  agentId: string;
  agentNom: string;
  agentPrenom: string;
  agentMatricule: string;
  serviceNom: string;
  saisiParNom: string;
  annuleParNom: string | null;
  total: bigint;
}

routesMouvements.get("/", exigeAuth(), exigeRole("LECTURE"), gardeChangementMotDePasse(), async (c) => {
  const analyse = schemaListeMouvements.safeParse(c.req.query());
  if (!analyse.success) {
    return c.json({ error: "Paramètres de recherche invalides." }, 400);
  }
  const { q, type, serviceId, dateDebut, dateFin, inclureAnnules, page, taille } = analyse.data;

  // Un agent supprimé (suppression douce) disparaît partout dans
  // l'application, y compris de ce journal des mouvements.
  const conditions: Prisma.Sql[] = [Prisma.sql`a."supprimeLe" IS NULL`];
  if (q) {
    const motif = `%${q}%`;
    conditions.push(
      Prisma.sql`(f_unaccent(a."nom") ILIKE f_unaccent(${motif}) OR f_unaccent(a."prenom") ILIKE f_unaccent(${motif}) OR a."matricule" ILIKE ${motif})`,
    );
  }
  if (type) conditions.push(Prisma.sql`m."type" = ${type}::"TypeMouvement"`);
  if (serviceId) conditions.push(Prisma.sql`a."serviceId" = ${serviceId}::uuid`);
  if (dateDebut) conditions.push(Prisma.sql`m."dateEffet" >= ${dateDebut}`);
  if (dateFin) conditions.push(Prisma.sql`m."dateEffet" <= ${dateFin}`);
  if (!inclureAnnules) conditions.push(Prisma.sql`m."annuleLe" IS NULL`);

  const whereSql = Prisma.sql`WHERE ${Prisma.join(conditions, " AND ")}`;
  const decalage = (page - 1) * taille;

  const lignes = await prisma.$queryRaw<LigneMouvement[]>`
    SELECT
      m."id", m."type", m."dateEffet", m."dateFin", m."motif", m."createdAt",
      m."annuleLe", m."motifAnnulation",
      a."id" AS "agentId", a."nom" AS "agentNom", a."prenom" AS "agentPrenom", a."matricule" AS "agentMatricule",
      s."nom" AS "serviceNom",
      su."nom" AS "saisiParNom",
      au."nom" AS "annuleParNom",
      COUNT(*) OVER() AS "total"
    FROM "Mouvement" m
    JOIN "Agent" a ON a."id" = m."agentId"
    JOIN "Service" s ON s."id" = a."serviceId"
    JOIN "Utilisateur" su ON su."id" = m."saisiParId"
    LEFT JOIN "Utilisateur" au ON au."id" = m."annuleParId"
    ${whereSql}
    ORDER BY m."dateEffet" DESC, m."createdAt" DESC
    LIMIT ${taille} OFFSET ${decalage}
  `;

  return c.json({
    donnees: lignes.map((l) => ({
      id: l.id,
      type: l.type,
      dateEffet: l.dateEffet,
      dateFin: l.dateFin,
      motif: l.motif,
      createdAt: l.createdAt,
      annuleLe: l.annuleLe,
      motifAnnulation: l.motifAnnulation,
      agent: { id: l.agentId, nom: l.agentNom, prenom: l.agentPrenom, matricule: l.agentMatricule },
      service: l.serviceNom,
      saisiPar: l.saisiParNom,
      annulePar: l.annuleParNom,
    })),
    page,
    taille,
    total: lignes.length > 0 ? Number(lignes[0]!.total) : 0,
  });
});

routesMouvements.post("/:id/annuler", exigeAuth(), exigeRole("ADMIN"), gardeChangementMotDePasse(), async (c) => {
  const id = c.req.param("id");
  if (!z.string().uuid().safeParse(id).success) {
    return c.json({ error: "Identifiant invalide." }, 400);
  }

  const corpsBrut = await c.req.json().catch(() => null);
  const analyse = schemaAnnulation.safeParse(corpsBrut);
  if (!analyse.success) {
    return c.json({ error: analyse.error.issues[0]?.message ?? "Données invalides.", champ: "motif" }, 400);
  }
  const { motif } = analyse.data;

  const mouvement = await prisma.mouvement.findUnique({ where: { id } });
  if (!mouvement) {
    return c.json({ error: "Mouvement introuvable." }, 404);
  }
  if (mouvement.annuleLe) {
    return c.json({ error: "Ce mouvement est déjà annulé." }, 422);
  }

  const utilisateur = c.get("utilisateur");
  const mouvementAnnule = await prisma.$transaction(async (tx) => {
    const misAJour = await tx.mouvement.update({
      where: { id },
      data: { annuleLe: new Date(), annuleParId: utilisateur.id, motifAnnulation: motif },
    });
    await tx.journal.create({
      data: {
        utilisateurId: utilisateur.id,
        action: "ANNULATION_MOUVEMENT",
        cibleType: "Mouvement",
        cibleId: id,
        detail: { agentId: mouvement.agentId, type: mouvement.type, motif },
        adresseIp: obtenirIp(c),
      },
    });
    return misAJour;
  });

  const mouvementsAgent = await prisma.mouvement.findMany({
    where: { agentId: mouvement.agentId },
    select: { type: true, dateEffet: true, dateFin: true, createdAt: true, annuleLe: true },
  });
  const statut = statutAgent(mouvementsAgent, dateDuJour());

  return c.json({ mouvement: mouvementAnnule, statut });
});
