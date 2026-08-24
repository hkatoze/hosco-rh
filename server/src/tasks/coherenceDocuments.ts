import { readdir, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "../config";
import { prisma } from "../db";

export interface RapportCoherence {
  /** Fichiers présents sur le disque, sans ligne Document ni Agent.photoPath correspondante. */
  fichiersOrphelins: string[];
  /** Lignes Document ou photos d'agent référençant un fichier absent du disque. */
  lignesSansFichier: Array<{ source: "Document" | "Agent.photoPath"; id: string; cheminRelatif: string }>;
}

async function listerFichiers(racine: string): Promise<string[]> {
  const resultats: string[] = [];
  async function parcourir(courant: string): Promise<void> {
    const entrees = await readdir(courant, { withFileTypes: true }).catch(() => []);
    for (const entree of entrees) {
      const cheminAbsolu = path.join(courant, entree.name);
      if (entree.isDirectory()) {
        await parcourir(cheminAbsolu);
      } else {
        resultats.push(path.relative(racine, cheminAbsolu).split(path.sep).join("/"));
      }
    }
  }
  await parcourir(racine);
  return resultats;
}

async function fichierExiste(cheminAbsolu: string): Promise<boolean> {
  try {
    await stat(cheminAbsolu);
    return true;
  } catch {
    return false;
  }
}

/**
 * Détecte les incohérences entre le disque et la base, dans les deux sens.
 * Ne supprime rien : ce n'est qu'un rapport, la décision reste humaine.
 */
export async function verifierCoherenceDocuments(racine: string = config.documentsRacine): Promise<RapportCoherence> {
  const [documents, agentsAvecPhoto] = await Promise.all([
    prisma.document.findMany({ select: { id: true, cheminFichier: true } }),
    prisma.agent.findMany({ where: { photoPath: { not: null } }, select: { id: true, photoPath: true } }),
  ]);

  const cheminsConnus = new Set<string>();
  for (const document of documents) cheminsConnus.add(document.cheminFichier);
  for (const agent of agentsAvecPhoto) if (agent.photoPath) cheminsConnus.add(agent.photoPath);

  const fichiersSurDisque = await listerFichiers(racine);
  const fichiersSurDisqueSet = new Set(fichiersSurDisque);

  const fichiersOrphelins = fichiersSurDisque.filter((chemin) => !cheminsConnus.has(chemin));

  const lignesSansFichier: RapportCoherence["lignesSansFichier"] = [];
  for (const document of documents) {
    if (!fichiersSurDisqueSet.has(document.cheminFichier)) {
      lignesSansFichier.push({ source: "Document", id: document.id, cheminRelatif: document.cheminFichier });
    }
  }
  for (const agent of agentsAvecPhoto) {
    if (agent.photoPath && !fichiersSurDisqueSet.has(agent.photoPath)) {
      lignesSansFichier.push({ source: "Agent.photoPath", id: agent.id, cheminRelatif: agent.photoPath });
    }
  }

  // Double vérification disque (readdir peut avoir un léger décalage temporel
  // avec des écritures concurrentes) : confirme réellement l'absence via stat.
  const lignesConfirmees: RapportCoherence["lignesSansFichier"] = [];
  for (const ligne of lignesSansFichier) {
    const cheminAbsolu = path.join(racine, ligne.cheminRelatif);
    if (!(await fichierExiste(cheminAbsolu))) lignesConfirmees.push(ligne);
  }

  return { fichiersOrphelins, lignesSansFichier: lignesConfirmees };
}

async function main(): Promise<void> {
  const rapport = await verifierCoherenceDocuments();
  console.log(`Fichiers orphelins (sur le disque, sans ligne en base) : ${rapport.fichiersOrphelins.length}`);
  for (const chemin of rapport.fichiersOrphelins) console.log(`  - ${chemin}`);
  console.log(`Lignes sans fichier (en base, absentes du disque) : ${rapport.lignesSansFichier.length}`);
  for (const ligne of rapport.lignesSansFichier) {
    console.log(`  - [${ligne.source}] ${ligne.id} -> ${ligne.cheminRelatif}`);
  }
}

const executeEnCli = process.argv[1] !== undefined && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (executeEnCli) {
  main()
    .catch((erreur: unknown) => {
      console.error("Échec de la vérification de cohérence :", erreur);
      process.exitCode = 1;
    })
    .finally(() => prisma.$disconnect());
}
