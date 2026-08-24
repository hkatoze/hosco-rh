import { readdir, rm, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "../config";
import { prisma } from "../db";

const NOM_CORBEILLE = "_corbeille";
const RETENTION_JOURS = 90;

async function listerFichiers(racine: string): Promise<string[]> {
  const resultats: string[] = [];
  async function parcourir(courant: string): Promise<void> {
    const entrees = await readdir(courant, { withFileTypes: true }).catch(() => []);
    for (const entree of entrees) {
      const cheminAbsolu = path.join(courant, entree.name);
      if (entree.isDirectory()) await parcourir(cheminAbsolu);
      else resultats.push(cheminAbsolu);
    }
  }
  await parcourir(racine);
  return resultats;
}

/** Supprime définitivement les fichiers de la corbeille déposés il y a plus de 90 jours. */
export async function purgerCorbeille(
  racine: string = config.documentsRacine,
  retentionJours: number = RETENTION_JOURS,
): Promise<string[]> {
  const dossierCorbeille = path.join(racine, NOM_CORBEILLE);
  const fichiers = await listerFichiers(dossierCorbeille);
  const limite = Date.now() - retentionJours * 24 * 60 * 60 * 1000;

  const purges: string[] = [];
  for (const fichier of fichiers) {
    const infos = await stat(fichier);
    if (infos.mtimeMs < limite) {
      await rm(fichier, { force: true });
      purges.push(path.relative(racine, fichier).split(path.sep).join("/"));
    }
  }
  return purges;
}

async function main(): Promise<void> {
  const purges = await purgerCorbeille();
  console.log(`Purge de la corbeille (>${RETENTION_JOURS} jours) : ${purges.length} fichier(s) supprimé(s).`);
  for (const chemin of purges) console.log(`  - ${chemin}`);
}

const executeEnCli = process.argv[1] !== undefined && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (executeEnCli) {
  main()
    .catch((erreur: unknown) => {
      console.error("Échec de la purge de la corbeille :", erreur);
      process.exitCode = 1;
    })
    .finally(() => prisma.$disconnect());
}
