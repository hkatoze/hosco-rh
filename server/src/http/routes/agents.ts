import { Hono } from "hono";
import { Prisma } from "@prisma/client";
import ExcelJS from "exceljs";
import { z } from "zod";
import { prisma } from "../../db";
import { dateDuJour, statutAgent, type StatutAgent } from "../../domain/statut";
import { validerNouveauMouvement } from "../../domain/mouvementValidation";
import { schemaCreationAgent, schemaModificationAgent } from "../../../../shared/agent";
import { schemaNouveauMouvement } from "../../../../shared/mouvement";
import type { VariablesHono } from "../context";
import { obtenirIp } from "../ip";
import { exigeAuth, exigeRole, gardeChangementMotDePasse } from "../middlewares/auth";

export const routesAgents = new Hono<{ Variables: VariablesHono }>();

const STATUTS: [StatutAgent, ...StatutAgent[]] = [
  "PRESENT",
  "EN_CONGE",
  "CONGE_DEPASSE",
  "SUSPENDU",
  "DEMISSIONNE",
  "LICENCIE",
  "RETRAITE",
  "DECEDE",
];
const TYPES_CONTRAT = ["CDI", "CDD", "STAGE", "VACATAIRE"] as const;

/**
 * Reprend le premier problème rencontré par Zod (convention déjà en place
 * ailleurs dans l'API) et l'associe au champ concerné, pour que le
 * formulaire agent puisse afficher l'erreur juste en dessous (voir
 * CLAUDE.md, tâche 6, point 4).
 */
function reponseErreurZod(erreur: z.ZodError): { error: string; champ: string | null } {
  const premier = erreur.issues[0];
  return { error: premier?.message ?? "Données invalides.", champ: (premier?.path[0] as string | undefined) ?? null };
}

const CHAMPS_TRI: Record<string, Prisma.Sql> = {
  nom: Prisma.sql`a."nom" ASC, a."prenom" ASC`,
  "-nom": Prisma.sql`a."nom" DESC, a."prenom" DESC`,
  dateRecrutement: Prisma.sql`a."dateRecrutement" ASC`,
  "-dateRecrutement": Prisma.sql`a."dateRecrutement" DESC`,
  matricule: Prisma.sql`a."matricule" ASC`,
  "-matricule": Prisma.sql`a."matricule" DESC`,
};

const schemaFiltresAgents = z.object({
  q: z.string().trim().min(1).optional(),
  serviceId: z.string().uuid().optional(),
  statut: z.enum(STATUTS).optional(),
  typeContrat: z.enum(TYPES_CONTRAT).optional(),
});

const schemaListeAgents = schemaFiltresAgents.extend({
  page: z.coerce.number().int().min(1).default(1),
  taille: z.coerce
    .number()
    .int()
    .min(1)
    .default(25)
    .transform((v) => Math.min(v, 100)),
  tri: z.enum(Object.keys(CHAMPS_TRI) as [string, ...string[]]).default("nom"),
});

/**
 * Conditions communes à la liste paginée et à l'export Excel : mêmes
 * filtres, même comportement — l'export doit refléter exactement la vue
 * filtrée à l'écran (voir CLAUDE.md : "filtrer des listes d'agents et les
 * exporter en Excel").
 */
function construireConditionsAgents(filtres: z.infer<typeof schemaFiltresAgents>): Prisma.Sql[] {
  // Un agent supprimé (suppression douce) ne doit jamais apparaître dans
  // l'annuaire ni la recherche — condition systématique, pas un filtre
  // utilisateur.
  const conditions: Prisma.Sql[] = [Prisma.sql`a."supprimeLe" IS NULL`];
  if (filtres.q) {
    const motif = `%${filtres.q}%`;
    conditions.push(
      Prisma.sql`(f_unaccent(a."nom") ILIKE f_unaccent(${motif}) OR f_unaccent(a."prenom") ILIKE f_unaccent(${motif}) OR a."matricule" ILIKE ${motif})`,
    );
  }
  if (filtres.serviceId) conditions.push(Prisma.sql`a."serviceId" = ${filtres.serviceId}::uuid`);
  if (filtres.statut) conditions.push(Prisma.sql`st."statut" = ${filtres.statut}`);
  if (filtres.typeContrat) conditions.push(Prisma.sql`a."typeContrat" = ${filtres.typeContrat}::"TypeContrat"`);
  return conditions;
}

const LIBELLE_STATUT: Record<StatutAgent, string> = {
  PRESENT: "Présent",
  EN_CONGE: "En congé",
  CONGE_DEPASSE: "Retour non saisi",
  SUSPENDU: "Suspendu",
  DEMISSIONNE: "Démissionné",
  LICENCIE: "Licencié",
  RETRAITE: "Retraité",
  DECEDE: "Décédé",
};

interface LigneAgentListe {
  id: string;
  matricule: string;
  nom: string;
  prenom: string;
  fonction: string;
  typeContrat: string;
  dateRecrutement: Date;
  serviceId: string;
  serviceNom: string;
  serviceCode: string;
  statut: StatutAgent | null;
  total: bigint;
}

routesAgents.get("/", exigeAuth(), exigeRole("LECTURE"), gardeChangementMotDePasse(), async (c) => {
  const analyse = schemaListeAgents.safeParse(c.req.query());
  if (!analyse.success) {
    return c.json({ error: "Paramètres de recherche invalides." }, 400);
  }
  const { q, serviceId, statut, typeContrat, page, taille, tri } = analyse.data;

  const conditions = construireConditionsAgents({ q, serviceId, statut, typeContrat });
  const whereSql = Prisma.sql`WHERE ${Prisma.join(conditions, " AND ")}`;
  const triSql = CHAMPS_TRI[tri] ?? CHAMPS_TRI.nom!;
  const decalage = (page - 1) * taille;

  const lignes = await prisma.$queryRaw<LigneAgentListe[]>`
    SELECT
      a."id", a."matricule", a."nom", a."prenom", a."fonction", a."typeContrat", a."dateRecrutement",
      s."id" AS "serviceId", s."nom" AS "serviceNom", s."code" AS "serviceCode",
      st."statut",
      COUNT(*) OVER() AS "total"
    FROM "Agent" a
    JOIN "Service" s ON s."id" = a."serviceId"
    LEFT JOIN "AgentStatutCourant" st ON st."agentId" = a."id"
    ${whereSql}
    ORDER BY ${triSql}
    LIMIT ${taille} OFFSET ${decalage}
  `;

  const utilisateur = c.get("utilisateur");
  await prisma.journal.create({
    data: {
      utilisateurId: utilisateur.id,
      action: "RECHERCHE",
      cibleType: "Agent",
      detail: { q: q ?? null, serviceId: serviceId ?? null, statut: statut ?? null, typeContrat: typeContrat ?? null, page, taille, tri },
      adresseIp: obtenirIp(c),
    },
  });

  return c.json({
    donnees: lignes.map((l) => ({
      id: l.id,
      matricule: l.matricule,
      nom: l.nom,
      prenom: l.prenom,
      fonction: l.fonction,
      typeContrat: l.typeContrat,
      dateRecrutement: l.dateRecrutement,
      statut: l.statut ?? "PRESENT",
      service: { id: l.serviceId, nom: l.serviceNom, code: l.serviceCode },
    })),
    page,
    taille,
    total: lignes.length > 0 ? Number(lignes[0]!.total) : 0,
  });
});

// Doit rester avant "/:id" : sinon Hono traiterait "export" comme une
// valeur d'identifiant.
routesAgents.get("/export", exigeAuth(), exigeRole("LECTURE"), gardeChangementMotDePasse(), async (c) => {
  const analyse = schemaFiltresAgents.safeParse(c.req.query());
  if (!analyse.success) {
    return c.json({ error: "Paramètres de recherche invalides." }, 400);
  }
  const { q, serviceId, statut, typeContrat } = analyse.data;

  const conditions = construireConditionsAgents({ q, serviceId, statut, typeContrat });
  const whereSql = Prisma.sql`WHERE ${Prisma.join(conditions, " AND ")}`;

  // Pas de pagination ici : l'export porte sur la vue filtrée entière,
  // pas seulement la page affichée à l'écran.
  const lignes = await prisma.$queryRaw<LigneAgentListe[]>`
    SELECT
      a."id", a."matricule", a."nom", a."prenom", a."fonction", a."typeContrat", a."dateRecrutement",
      s."id" AS "serviceId", s."nom" AS "serviceNom", s."code" AS "serviceCode",
      st."statut",
      0 AS "total"
    FROM "Agent" a
    JOIN "Service" s ON s."id" = a."serviceId"
    LEFT JOIN "AgentStatutCourant" st ON st."agentId" = a."id"
    ${whereSql}
    ORDER BY a."nom" ASC, a."prenom" ASC
  `;

  const classeur = new ExcelJS.Workbook();
  classeur.creator = "ZAKA RH";
  classeur.created = new Date();
  const feuille = classeur.addWorksheet("Personnel");

  feuille.columns = [
    { header: "Matricule", key: "matricule", width: 16 },
    { header: "Nom", key: "nom", width: 20 },
    { header: "Prénom", key: "prenom", width: 20 },
    { header: "Service", key: "service", width: 18 },
    { header: "Fonction", key: "fonction", width: 24 },
    { header: "Statut", key: "statut", width: 18 },
    { header: "Type de contrat", key: "typeContrat", width: 16 },
    { header: "Date de recrutement", key: "dateRecrutement", width: 20 },
  ];
  feuille.getRow(1).font = { bold: true };

  for (const l of lignes) {
    feuille.addRow({
      matricule: l.matricule,
      nom: l.nom,
      prenom: l.prenom,
      service: l.serviceNom,
      fonction: l.fonction,
      statut: LIBELLE_STATUT[(l.statut as StatutAgent | null) ?? "PRESENT"],
      typeContrat: l.typeContrat,
      dateRecrutement: l.dateRecrutement.toLocaleDateString("fr-FR"),
    });
  }

  const utilisateur = c.get("utilisateur");
  await prisma.journal.create({
    data: {
      utilisateurId: utilisateur.id,
      action: "EXPORT_PERSONNEL",
      cibleType: "Agent",
      detail: { q: q ?? null, serviceId: serviceId ?? null, statut: statut ?? null, typeContrat: typeContrat ?? null, nombreLignes: lignes.length },
      adresseIp: obtenirIp(c),
    },
  });

  // Buffer est une sous-classe de Uint8Array : pas besoin de conversion,
  // juste un typage explicite pour c.body().
  const tampon = new Uint8Array(await classeur.xlsx.writeBuffer());
  const nomFichier = `annuaire-personnel-${new Date().toISOString().slice(0, 10)}.xlsx`;

  c.header("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  c.header("Content-Disposition", `attachment; filename="${nomFichier}"`);
  return c.body(tampon);
});

routesAgents.get("/:id", exigeAuth(), exigeRole("LECTURE"), gardeChangementMotDePasse(), async (c) => {
  const id = c.req.param("id");
  if (!z.string().uuid().safeParse(id).success) {
    return c.json({ error: "Identifiant invalide." }, 400);
  }

  const agent = await prisma.agent.findUnique({
    where: { id },
    include: {
      service: true,
      mouvements: {
        orderBy: { dateEffet: "desc" },
        include: { saisiPar: { select: { nom: true } }, annulePar: { select: { nom: true } } },
      },
      documents: {
        where: { supprimeLe: null },
        select: { id: true, type: true, nomOrigine: true, tailleOctets: true, mimeType: true, createdAt: true },
      },
    },
  });
  if (!agent || agent.supprimeLe) {
    return c.json({ error: "Agent introuvable." }, 404);
  }

  const utilisateur = c.get("utilisateur");
  await prisma.journal.create({
    data: {
      utilisateurId: utilisateur.id,
      action: "CONSULTATION_FICHE",
      cibleType: "Agent",
      cibleId: agent.id,
      adresseIp: obtenirIp(c),
    },
  });

  return c.json({
    ...agent,
    statut: statutAgent(agent.mouvements, dateDuJour()),
  });
});

routesAgents.post("/", exigeAuth(), exigeRole("SAISIE"), gardeChangementMotDePasse(), async (c) => {
  const corpsBrut = await c.req.json().catch(() => null);
  const analyse = schemaCreationAgent.safeParse(corpsBrut);
  if (!analyse.success) {
    return c.json(reponseErreurZod(analyse.error), 422);
  }
  const donnees = analyse.data;

  const service = await prisma.service.findUnique({ where: { id: donnees.serviceId } });
  if (!service) {
    return c.json({ error: "Service introuvable.", champ: "serviceId" }, 422);
  }

  const utilisateur = c.get("utilisateur");

  try {
    const agent = await prisma.$transaction(async (tx) => {
      const agentCree = await tx.agent.create({ data: donnees });
      await tx.mouvement.create({
        data: {
          agentId: agentCree.id,
          type: "RECRUTEMENT",
          dateEffet: donnees.dateRecrutement,
          motif: "Recrutement initial",
          saisiParId: utilisateur.id,
        },
      });
      await tx.journal.create({
        data: {
          utilisateurId: utilisateur.id,
          action: "CREATION_AGENT",
          cibleType: "Agent",
          cibleId: agentCree.id,
          detail: { matricule: agentCree.matricule },
          adresseIp: obtenirIp(c),
        },
      });
      return agentCree;
    });
    return c.json(agent, 201);
  } catch (erreur) {
    if (erreur instanceof Prisma.PrismaClientKnownRequestError && erreur.code === "P2002") {
      return c.json({ error: "Ce matricule est déjà utilisé." }, 409);
    }
    throw erreur;
  }
});

routesAgents.patch("/:id", exigeAuth(), exigeRole("SAISIE"), gardeChangementMotDePasse(), async (c) => {
  const id = c.req.param("id");
  if (!z.string().uuid().safeParse(id).success) {
    return c.json({ error: "Identifiant invalide." }, 400);
  }

  const corpsBrut = await c.req.json().catch(() => null);
  const analyse = schemaModificationAgent.safeParse(corpsBrut);
  if (!analyse.success) {
    return c.json(reponseErreurZod(analyse.error), 422);
  }
  const modifications = analyse.data;

  const existant = await prisma.agent.findUnique({ where: { id } });
  if (!existant || existant.supprimeLe) {
    return c.json({ error: "Agent introuvable." }, 404);
  }

  if (modifications.serviceId) {
    const service = await prisma.service.findUnique({ where: { id: modifications.serviceId } });
    if (!service) {
      return c.json({ error: "Service introuvable.", champ: "serviceId" }, 422);
    }
  }

  const champsModifies: Record<string, { avant: Prisma.InputJsonValue; apres: Prisma.InputJsonValue }> = {};
  for (const [champ, valeur] of Object.entries(modifications)) {
    const avant = (existant as unknown as Record<string, unknown>)[champ];
    const avantComparable = avant instanceof Date ? avant.toISOString() : ((avant ?? null) as Prisma.InputJsonValue);
    const apresComparable = valeur instanceof Date ? valeur.toISOString() : ((valeur ?? null) as Prisma.InputJsonValue);
    if (avantComparable !== apresComparable) {
      champsModifies[champ] = { avant: avantComparable, apres: apresComparable };
    }
  }

  const utilisateur = c.get("utilisateur");
  const agent = await prisma.$transaction(async (tx) => {
    const misAJour = await tx.agent.update({ where: { id }, data: modifications });
    if (Object.keys(champsModifies).length > 0) {
      await tx.journal.create({
        data: {
          utilisateurId: utilisateur.id,
          action: "MODIFICATION_AGENT",
          cibleType: "Agent",
          cibleId: id,
          detail: champsModifies,
          adresseIp: obtenirIp(c),
        },
      });
    }
    return misAJour;
  });

  return c.json(agent);
});

routesAgents.post("/:id/mouvements", exigeAuth(), exigeRole("SAISIE"), gardeChangementMotDePasse(), async (c) => {
  const id = c.req.param("id");
  if (!z.string().uuid().safeParse(id).success) {
    return c.json({ error: "Identifiant invalide." }, 400);
  }

  const corpsBrut = await c.req.json().catch(() => null);
  const analyse = schemaNouveauMouvement.safeParse(corpsBrut);
  if (!analyse.success) {
    return c.json(reponseErreurZod(analyse.error), 400);
  }
  const nouveau = analyse.data;

  const agent = await prisma.agent.findUnique({
    where: { id },
    include: { mouvements: { select: { type: true, dateEffet: true, dateFin: true, createdAt: true, annuleLe: true } } },
  });
  if (!agent || agent.supprimeLe) {
    return c.json({ error: "Agent introuvable." }, 404);
  }

  const erreur = validerNouveauMouvement(agent.mouvements, nouveau, agent.dateRecrutement);
  if (erreur) {
    return c.json({ error: erreur.message, champ: erreur.champ }, 422);
  }

  if (nouveau.documentId) {
    const document = await prisma.document.findFirst({
      where: { id: nouveau.documentId, agentId: agent.id, supprimeLe: null },
    });
    if (!document) {
      return c.json({ error: "Document introuvable ou non rattaché à cet agent.", champ: "documentId" }, 422);
    }
  }

  const utilisateur = c.get("utilisateur");
  const mouvement = await prisma.$transaction(async (tx) => {
    const cree = await tx.mouvement.create({
      data: {
        agentId: agent.id,
        type: nouveau.type,
        dateEffet: nouveau.dateEffet,
        dateFin: nouveau.dateFin,
        motif: nouveau.motif ?? null,
        documentId: nouveau.documentId ?? null,
        saisiParId: utilisateur.id,
      },
    });
    await tx.journal.create({
      data: {
        utilisateurId: utilisateur.id,
        action: "AJOUT_MOUVEMENT",
        cibleType: "Agent",
        cibleId: agent.id,
        detail: { mouvementId: cree.id, type: cree.type, dateEffet: cree.dateEffet.toISOString() },
        adresseIp: obtenirIp(c),
      },
    });
    return cree;
  });

  const statutMisAJour = statutAgent([...agent.mouvements, mouvement], dateDuJour());

  return c.json({ mouvement, statut: statutMisAJour }, 201);
});

routesAgents.delete("/:id", exigeAuth(), exigeRole("ADMIN"), gardeChangementMotDePasse(), async (c) => {
  const id = c.req.param("id");
  if (!z.string().uuid().safeParse(id).success) {
    return c.json({ error: "Identifiant invalide." }, 400);
  }

  const agent = await prisma.agent.findUnique({ where: { id } });
  if (!agent || agent.supprimeLe) {
    return c.json({ error: "Agent introuvable." }, 404);
  }

  const utilisateur = c.get("utilisateur");
  await prisma.$transaction(async (tx) => {
    await tx.agent.update({ where: { id }, data: { supprimeLe: new Date(), supprimeParId: utilisateur.id } });
    await tx.journal.create({
      data: {
        utilisateurId: utilisateur.id,
        action: "SUPPRESSION_AGENT",
        cibleType: "Agent",
        cibleId: id,
        detail: { matricule: agent.matricule },
        adresseIp: obtenirIp(c),
      },
    });
  });

  return c.json({ ok: true });
});
