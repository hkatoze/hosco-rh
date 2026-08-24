import { PrismaClient } from "@prisma/client";
import { genererMotDePasseTemporaire, hacherMotDePasse } from "../src/domain/auth/motDePasse";

/**
 * Crée le tout premier compte ADMIN d'un déploiement, à la main, une seule
 * fois. Nécessaire car POST /api/utilisateurs exige déjà une session ADMIN —
 * problème de l'œuf et la poule au tout premier démarrage. Ne fait pas
 * partie de seed.ts, qui génère lui un jeu de données de démonstration
 * (30 agents fictifs) inadapté à une base de production.
 *
 * Usage : npx tsx prisma/creerAdmin.ts <identifiant> "<nom complet>"
 */

const prisma = new PrismaClient();

async function main() {
  const [identifiant, nom] = process.argv.slice(2);
  if (!identifiant || !nom) {
    console.error('Usage : npx tsx prisma/creerAdmin.ts <identifiant> "<nom complet>"');
    process.exitCode = 1;
    return;
  }

  const existant = await prisma.utilisateur.findUnique({ where: { identifiant } });
  if (existant) {
    console.error(`Un compte "${identifiant}" existe déjà.`);
    process.exitCode = 1;
    return;
  }

  const motDePasseTemporaire = genererMotDePasseTemporaire();
  const motDePasseHash = await hacherMotDePasse(motDePasseTemporaire);

  const utilisateur = await prisma.utilisateur.create({
    data: { identifiant, nom, role: "ADMIN", motDePasseHash, actif: true, doitChangerMotDePasse: true },
    select: { id: true, identifiant: true, nom: true, role: true },
  });

  console.log("Compte ADMIN créé :");
  console.log(`  identifiant : ${utilisateur.identifiant}`);
  console.log(`  nom         : ${utilisateur.nom}`);
  console.log(`  mot de passe temporaire (à noter, non stocké) : ${motDePasseTemporaire}`);
  console.log("Le changement de mot de passe sera exigé à la première connexion.");
}

main()
  .catch((erreur: unknown) => {
    console.error(erreur);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
