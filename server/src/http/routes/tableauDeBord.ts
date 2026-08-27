import { Hono } from "hono";
import ExcelJS from "exceljs";
import { prisma } from "../../db";
import { dateDuJour, statutAgent, type StatutAgent } from "../../domain/statut";
import type { VariablesHono } from "../context";
import { obtenirIp } from "../ip";
import { exigeAuth, exigeRole, gardeChangementMotDePasse } from "../middlewares/auth";

export const routesTableauDeBord = new Hono<{ Variables: VariablesHono }>();

const STATUTS_DEFINITIFS: ReadonlySet<StatutAgent> = new Set(["DEMISSIONNE", "LICENCIE", "RETRAITE", "DECEDE"]);
const TYPES_MOUVEMENT_DEPART = new Set(["DEMISSION", "LICENCIEMENT", "RETRAITE", "DECES"]);

const LIBELLE_TYPE_MOUVEMENT: Record<string, string> = {
  RECRUTEMENT: "Recrutement",
  CONGE: "Congé",
  RETOUR_CONGE: "Retour de congé",
  SUSPENSION: "Suspension",
  FIN_SUSPENSION: "Fin de suspension",
  DEMISSION: "Démission",
  LICENCIEMENT: "Licenciement",
  RETRAITE: "Retraite",
  DECES: "Décès",
};

function ajouterMois(date: Date, mois: number): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + mois, date.getUTCDate()));
}

function debutDuMois(date: Date, decalageMois = 0): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + decalageMois, 1));
}

/**
 * Tous les chiffres viennent de statutAgent() (jamais recalculés
 * autrement — voir CLAUDE.md) ou d'un comptage direct des mouvements
 * bruts. Aucune valeur n'est inventée ou simulée : ce que l'écran ne peut
 * pas calculer honnêtement (ex: un vrai taux de pointage) n'y figure pas.
 * Partagée entre l'écran (GET /) et le rapport Excel (GET /rapport) : les
 * deux doivent toujours s'accorder.
 */
async function calculerStatistiques() {
  const aujourdhui = dateDuJour();
  const ilYAUnMois = ajouterMois(aujourdhui, -1);
  const debutMoisCourant = debutDuMois(aujourdhui);
  const debutMoisPrecedent = debutDuMois(aujourdhui, -1);

  const agents = await prisma.agent.findMany({
    where: { supprimeLe: null },
    select: {
      serviceId: true,
      service: { select: { nom: true } },
      mouvements: { select: { type: true, dateEffet: true, dateFin: true, createdAt: true, annuleLe: true } },
    },
  });

  let totalPersonnel = 0;
  let totalPersonnelIlYAUnMois = 0;
  let enAbsence = 0;
  const parService = new Map<string, { nom: string; effectif: number }>();

  for (const agent of agents) {
    const statutActuel = statutAgent(agent.mouvements, aujourdhui);
    if (!STATUTS_DEFINITIFS.has(statutActuel)) {
      totalPersonnel++;
      if (statutActuel === "EN_CONGE" || statutActuel === "SUSPENDU") enAbsence++;
      const entree = parService.get(agent.serviceId) ?? { nom: agent.service.nom, effectif: 0 };
      entree.effectif++;
      parService.set(agent.serviceId, entree);
    }
    if (!STATUTS_DEFINITIFS.has(statutAgent(agent.mouvements, ilYAUnMois))) {
      totalPersonnelIlYAUnMois++;
    }
  }

  const [mouvementsMoisCourant, mouvementsMoisPrecedent] = await Promise.all([
    prisma.mouvement.findMany({
      where: { annuleLe: null, dateEffet: { gte: debutMoisCourant, lte: aujourdhui }, agent: { supprimeLe: null } },
      select: {
        type: true,
        dateEffet: true,
        motif: true,
        agent: { select: { nom: true, prenom: true, matricule: true, service: { select: { nom: true } } } },
      },
      orderBy: { dateEffet: "desc" },
    }),
    prisma.mouvement.findMany({
      where: { annuleLe: null, dateEffet: { gte: debutMoisPrecedent, lt: debutMoisCourant }, agent: { supprimeLe: null } },
      select: { type: true },
    }),
  ]);

  const compterType = (mouvements: { type: string }[], predicat: (type: string) => boolean) =>
    mouvements.filter((m) => predicat(m.type)).length;

  const repartitionParService = [...parService.values()]
    .map((s) => ({
      nom: s.nom,
      effectif: s.effectif,
      pourcentage: totalPersonnel > 0 ? Math.round((s.effectif / totalPersonnel) * 1000) / 10 : 0,
    }))
    .sort((a, b) => b.effectif - a.effectif);

  return {
    aujourdhui,
    totalPersonnel,
    totalPersonnelVariation: totalPersonnel - totalPersonnelIlYAUnMois,
    arriveesMois: compterType(mouvementsMoisCourant, (t) => t === "RECRUTEMENT"),
    arriveesMoisPrecedent: compterType(mouvementsMoisPrecedent, (t) => t === "RECRUTEMENT"),
    departsMois: compterType(mouvementsMoisCourant, (t) => TYPES_MOUVEMENT_DEPART.has(t)),
    departsMoisPrecedent: compterType(mouvementsMoisPrecedent, (t) => TYPES_MOUVEMENT_DEPART.has(t)),
    tauxAbsence: totalPersonnel > 0 ? Math.round((enAbsence / totalPersonnel) * 1000) / 10 : 0,
    repartitionParService,
    mouvementsMoisCourant,
  };
}

routesTableauDeBord.get("/", exigeAuth(), exigeRole("LECTURE"), gardeChangementMotDePasse(), async (c) => {
  const stats = await calculerStatistiques();
  return c.json({
    totalPersonnel: stats.totalPersonnel,
    totalPersonnelVariation: stats.totalPersonnelVariation,
    arriveesMois: stats.arriveesMois,
    arriveesMoisPrecedent: stats.arriveesMoisPrecedent,
    departsMois: stats.departsMois,
    departsMoisPrecedent: stats.departsMoisPrecedent,
    tauxAbsence: stats.tauxAbsence,
    repartitionParService: stats.repartitionParService,
  });
});

routesTableauDeBord.get("/rapport", exigeAuth(), exigeRole("LECTURE"), gardeChangementMotDePasse(), async (c) => {
  const stats = await calculerStatistiques();
  const dateGeneration = new Date().toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric" });
  const nomMoisCourant = stats.aujourdhui.toLocaleDateString("fr-FR", { month: "long", year: "numeric" });

  const classeur = new ExcelJS.Workbook();
  classeur.creator = "Axone";
  classeur.created = new Date();

  const resume = classeur.addWorksheet("Résumé");
  resume.columns = [
    { key: "libelle", width: 32 },
    { key: "valeur", width: 20 },
  ];
  resume.addRow(["Rapport RH — Hôpital Saint Camille", ""]).font = { bold: true };
  resume.addRow([`Généré le ${dateGeneration}`, ""]);
  resume.addRow([]);
  resume.addRow(["Indicateur", "Valeur"]).font = { bold: true };
  resume.addRow(["Personnel actif", stats.totalPersonnel]);
  resume.addRow(["Variation sur 1 mois", stats.totalPersonnelVariation]);
  resume.addRow([`Arrivées (${nomMoisCourant})`, stats.arriveesMois]);
  resume.addRow(["Arrivées (mois précédent)", stats.arriveesMoisPrecedent]);
  resume.addRow([`Départs (${nomMoisCourant})`, stats.departsMois]);
  resume.addRow(["Départs (mois précédent)", stats.departsMoisPrecedent]);
  resume.addRow(["Taux d'absence actuel", `${stats.tauxAbsence}%`]);

  const repartition = classeur.addWorksheet("Répartition par service");
  repartition.columns = [
    { header: "Service", key: "nom", width: 24 },
    { header: "Effectif actif", key: "effectif", width: 16 },
    { header: "Part de l'effectif", key: "pourcentage", width: 18 },
  ];
  repartition.getRow(1).font = { bold: true };
  for (const s of stats.repartitionParService) {
    repartition.addRow({ nom: s.nom, effectif: s.effectif, pourcentage: `${s.pourcentage}%` });
  }

  const mouvements = classeur.addWorksheet(`Mouvements (${nomMoisCourant})`);
  mouvements.columns = [
    { header: "Date", key: "date", width: 14 },
    { header: "Type", key: "type", width: 18 },
    { header: "Agent", key: "agent", width: 26 },
    { header: "Matricule", key: "matricule", width: 16 },
    { header: "Service", key: "service", width: 18 },
    { header: "Motif", key: "motif", width: 30 },
  ];
  mouvements.getRow(1).font = { bold: true };
  for (const m of stats.mouvementsMoisCourant) {
    mouvements.addRow({
      date: m.dateEffet.toLocaleDateString("fr-FR"),
      type: LIBELLE_TYPE_MOUVEMENT[m.type] ?? m.type,
      agent: `${m.agent.nom}, ${m.agent.prenom}`,
      matricule: m.agent.matricule,
      service: m.agent.service.nom,
      motif: m.motif ?? "",
    });
  }

  const utilisateur = c.get("utilisateur");
  await prisma.journal.create({
    data: {
      utilisateurId: utilisateur.id,
      action: "EXPORT_RAPPORT_TABLEAU_DE_BORD",
      cibleType: "Agent",
      detail: { totalPersonnel: stats.totalPersonnel, mouvementsMoisCourant: stats.mouvementsMoisCourant.length },
      adresseIp: obtenirIp(c),
    },
  });

  const tampon = new Uint8Array(await classeur.xlsx.writeBuffer());
  const nomFichier = `rapport-rh-${new Date().toISOString().slice(0, 10)}.xlsx`;

  c.header("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  c.header("Content-Disposition", `attachment; filename="${nomFichier}"`);
  return c.body(tampon);
});
