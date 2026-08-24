import { mkdir, rename } from "node:fs/promises";
import path from "node:path";
import { Hono } from "hono";
import { z } from "zod";
import { config } from "../../config";
import { prisma } from "../../db";
import { cheminDocument, resoudreCheminAbsolu } from "../../storage/chemins";
import type { VariablesHono } from "../context";
import { obtenirIp } from "../ip";
import { exigeAuth, exigeRole, gardeChangementMotDePasse } from "../middlewares/auth";

export const routesCorbeille = new Hono<{ Variables: VariablesHono }>();

// Doit rester égal à RETENTION_JOURS dans server/src/tasks/purgeCorbeille.ts
// (purge automatique) : ce nombre n'est ici qu'informatif pour l'écran de
// gestion de la corbeille, pas une nouvelle source de vérité.
const RETENTION_JOURS = 90;

function joursRestants(supprimeLe: Date): number {
  const echeance = supprimeLe.getTime() + RETENTION_JOURS * 24 * 60 * 60 * 1000;
  return Math.max(0, Math.ceil((echeance - Date.now()) / (24 * 60 * 60 * 1000)));
}

function estUuid(valeur: string): boolean {
  return z.string().uuid().safeParse(valeur).success;
}

routesCorbeille.get("/", exigeAuth(), exigeRole("ADMIN"), gardeChangementMotDePasse(), async (c) => {
  const [documents, agents] = await Promise.all([
    prisma.document.findMany({
      where: { supprimeLe: { not: null } },
      include: {
        agent: { select: { id: true, nom: true, prenom: true, matricule: true } },
        supprimePar: { select: { nom: true } },
      },
      orderBy: { supprimeLe: "desc" },
    }),
    prisma.agent.findMany({
      where: { supprimeLe: { not: null } },
      include: { supprimePar: { select: { nom: true } } },
      orderBy: { supprimeLe: "desc" },
    }),
  ]);

  return c.json({
    documents: documents.map((d) => ({
      id: d.id,
      type: d.type,
      nomOrigine: d.nomOrigine,
      agent: d.agent,
      supprimeLe: d.supprimeLe,
      supprimePar: d.supprimePar?.nom ?? null,
      joursRestants: joursRestants(d.supprimeLe!),
    })),
    agents: agents.map((a) => ({
      id: a.id,
      matricule: a.matricule,
      nom: a.nom,
      prenom: a.prenom,
      supprimeLe: a.supprimeLe,
      supprimePar: a.supprimePar?.nom ?? null,
      joursRestants: joursRestants(a.supprimeLe!),
    })),
  });
});

routesCorbeille.post("/documents/:id/restaurer", exigeAuth(), exigeRole("ADMIN"), gardeChangementMotDePasse(), async (c) => {
  const id = c.req.param("id");
  if (!estUuid(id)) return c.json({ error: "Identifiant invalide." }, 400);

  const document = await prisma.document.findUnique({ where: { id } });
  if (!document || !document.supprimeLe) {
    return c.json({ error: "Document introuvable dans la corbeille." }, 404);
  }

  const extension = path.extname(document.cheminFichier).slice(1);
  const uuid = path.basename(document.cheminFichier, path.extname(document.cheminFichier));
  // L'année d'origine peut être révolue : on range sous l'année courante,
  // le chemin exact n'a pas d'importance tant qu'il reste sous la racine.
  const cheminRestaureRelatif = cheminDocument(new Date().getFullYear(), document.agentId, uuid, extension);
  const cheminRestaureAbsolu = resoudreCheminAbsolu(config.documentsRacine, cheminRestaureRelatif);
  const cheminCorbeilleAbsolu = resoudreCheminAbsolu(config.documentsRacine, document.cheminFichier);

  await mkdir(path.dirname(cheminRestaureAbsolu), { recursive: true });
  await rename(cheminCorbeilleAbsolu, cheminRestaureAbsolu);

  const utilisateur = c.get("utilisateur");
  const documentRestaure = await prisma.document.update({
    where: { id },
    data: { cheminFichier: cheminRestaureRelatif, supprimeLe: null, supprimeParId: null },
  });

  await prisma.journal.create({
    data: {
      utilisateurId: utilisateur.id,
      action: "RESTAURATION_DOCUMENT",
      cibleType: "Document",
      cibleId: id,
      detail: { agentId: document.agentId },
      adresseIp: obtenirIp(c),
    },
  });

  return c.json(documentRestaure);
});

routesCorbeille.post("/agents/:id/restaurer", exigeAuth(), exigeRole("ADMIN"), gardeChangementMotDePasse(), async (c) => {
  const id = c.req.param("id");
  if (!estUuid(id)) return c.json({ error: "Identifiant invalide." }, 400);

  const agent = await prisma.agent.findUnique({ where: { id } });
  if (!agent || !agent.supprimeLe) {
    return c.json({ error: "Agent introuvable dans la corbeille." }, 404);
  }

  const utilisateur = c.get("utilisateur");
  const agentRestaure = await prisma.agent.update({ where: { id }, data: { supprimeLe: null, supprimeParId: null } });

  await prisma.journal.create({
    data: {
      utilisateurId: utilisateur.id,
      action: "RESTAURATION_AGENT",
      cibleType: "Agent",
      cibleId: id,
      detail: { matricule: agent.matricule },
      adresseIp: obtenirIp(c),
    },
  });

  return c.json(agentRestaure);
});
