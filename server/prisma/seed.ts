import {
  PrismaClient,
  RoleUtilisateur,
  Sexe,
  SituationMatrimoniale,
  TypeContrat,
  TypeDocument,
  TypeMouvement,
} from "@prisma/client";
import argon2 from "argon2";

const prisma = new PrismaClient();

// PRNG déterministe : le jeu de données généré est le même à chaque exécution,
// ce qui facilite la relecture et les démonstrations au service RH.
function mulberry32(seed: number) {
  let etat = seed | 0;
  return function alea(): number {
    etat = (etat + 0x6d2b79f5) | 0;
    let t = Math.imul(etat ^ (etat >>> 15), 1 | etat);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const alea = mulberry32(20260820);

function choisir<T>(items: readonly T[]): T {
  return items[Math.floor(alea() * items.length)]!;
}

function entierAleatoire(min: number, max: number): number {
  return Math.floor(alea() * (max - min + 1)) + min;
}

function dateAleatoire(debut: Date, fin: Date): Date {
  if (fin.getTime() <= debut.getTime()) return new Date(debut);
  return new Date(debut.getTime() + alea() * (fin.getTime() - debut.getTime()));
}

function ajouterMois(date: Date, mois: number): Date {
  const d = new Date(date);
  d.setMonth(d.getMonth() + mois);
  return d;
}

function auPlusTard(date: Date, limite: Date): Date {
  return date.getTime() > limite.getTime() ? new Date(limite) : date;
}

function uuidPseudoAleatoire(): string {
  const hex = () => Math.floor(alea() * 16).toString(16);
  const bloc = (n: number) => Array.from({ length: n }, hex).join("");
  const variante = (8 + Math.floor(alea() * 4)).toString(16);
  return `${bloc(8)}-${bloc(4)}-4${bloc(3)}-${variante}${bloc(3)}-${bloc(12)}`;
}

const SERVICES = [
  { nom: "Urgences", code: "URG" },
  { nom: "Cardiologie", code: "CARD" },
  { nom: "Pédiatrie", code: "PED" },
  { nom: "Administration", code: "ADM" },
  { nom: "Laboratoire", code: "LAB" },
] as const;

const FONCTIONS_PAR_SERVICE: Record<(typeof SERVICES)[number]["code"], readonly string[]> = {
  URG: ["Médecin Urgentiste", "Infirmier d'État", "Brancardier", "Aide-soignant"],
  CARD: ["Cardiologue", "Infirmier Chef", "Technicien Supérieur"],
  PED: ["Pédiatre", "Infirmière d'État", "Sage-femme", "Aide-soignante"],
  ADM: ["Directeur des RH", "Agent d'accueil", "Comptable", "Secrétaire"],
  LAB: ["Technicien de laboratoire", "Pharmacien", "Technicien Supérieur"],
};

const NOMS_FAMILLE = [
  "Ouédraogo", "Sawadogo", "Kaboré", "Traoré", "Zongo", "Compaoré",
  "Diarra", "Barry", "Sana", "Konaté", "Coulibaly", "Sanogo",
  "Bamogo", "Yaméogo", "Nikiéma", "Tapsoba", "Kafando", "Zerbo",
  "Bationo", "Sanou", "Kambou", "Ouattara", "Kiendrébéogo", "Dabiré",
  "Somé", "Bado", "Ilboudo", "Zoungrana", "Kaboret", "Ki",
] as const;

const PRENOMS_MASCULINS = [
  "Moussa", "Alassane", "Ibrahim", "Yacouba", "Ousmane", "Souleymane",
  "Drissa", "Bakary", "Boureima", "Adama", "Issa", "Mamadou",
  "Abdoulaye", "Karim", "Seydou", "Boukary", "Idrissa",
] as const;

const PRENOMS_FEMININS = [
  "Fatoumata", "Assetou", "Mariam", "Aminata", "Aïcha", "Salimata",
  "Awa", "Rasmata", "Zenabo", "Hawa", "Kadidia", "Fatimata",
  "Rachidatou", "Safiatou", "Djénéba",
] as const;

const VILLES = [
  "Ouagadougou", "Bobo-Dioulasso", "Koudougou", "Ouahigouya", "Banfora",
  "Kaya", "Tenkodogo", "Fada N'Gourma", "Dédougou", "Gaoua",
] as const;

const SITUATIONS_MATRIMONIALES = [
  SituationMatrimoniale.CELIBATAIRE,
  SituationMatrimoniale.MARIE,
  SituationMatrimoniale.DIVORCE,
  SituationMatrimoniale.VEUF,
] as const;

function tirerTypeContrat(): TypeContrat {
  const t = alea();
  // Répartition réaliste : majorité de CDI, quelques CDD, peu de stagiaires/vacataires.
  if (t < 0.7) return TypeContrat.CDI;
  if (t < 0.9) return TypeContrat.CDD;
  if (t < 0.95) return TypeContrat.STAGE;
  return TypeContrat.VACATAIRE;
}

async function main() {
  console.log("Nettoyage de la base...");
  await prisma.journal.deleteMany();
  await prisma.mouvement.deleteMany();
  await prisma.document.deleteMany();
  await prisma.agent.deleteMany();
  await prisma.utilisateur.deleteMany();
  await prisma.service.deleteMany();

  console.log("Services...");
  const services = await Promise.all(
    SERVICES.map((s) => prisma.service.create({ data: { nom: s.nom, code: s.code, actif: true } }))
  );

  console.log("Utilisateurs...");
  const motDePasseDemo = await argon2.hash("ChangeMoi123!");
  await prisma.utilisateur.create({
    data: {
      identifiant: "lecture.rh",
      nom: "Agent Lecture Seule",
      motDePasseHash: motDePasseDemo,
      role: RoleUtilisateur.LECTURE,
      actif: true,
      doitChangerMotDePasse: true,
    },
  });
  const utilSaisieRow = await prisma.utilisateur.create({
    data: {
      identifiant: "saisie.rh",
      nom: "Agent Saisie RH",
      motDePasseHash: motDePasseDemo,
      role: RoleUtilisateur.SAISIE,
      actif: true,
      doitChangerMotDePasse: true,
    },
  });
  const utilAdminRow = await prisma.utilisateur.create({
    data: {
      identifiant: "admin.rh",
      nom: "Administrateur RH",
      motDePasseHash: motDePasseDemo,
      role: RoleUtilisateur.ADMIN,
      actif: true,
      doitChangerMotDePasse: true,
    },
  });
  const utilSaisie = utilSaisieRow.id;
  const utilAdmin = utilAdminRow.id;

  const maintenant = new Date();

  async function creerDocumentsAgent(agentId: string, nom: string, prenom: string) {
    const items: Array<{ type: TypeDocument; libelle: string }> = [
      { type: TypeDocument.CV, libelle: "CV" },
      { type: TypeDocument.DIPLOME, libelle: "Diplome" },
      { type: TypeDocument.CONTRAT, libelle: "Contrat" },
    ];
    for (const item of items) {
      const nomFichier = `${uuidPseudoAleatoire()}.pdf`;
      await prisma.document.create({
        data: {
          agentId,
          type: item.type,
          nomOrigine: `${item.libelle}_${nom}_${prenom}.pdf`,
          cheminFichier: `agents/${agentId}/${nomFichier}`,
          tailleOctets: entierAleatoire(80_000, 4_000_000),
          mimeType: "application/pdf",
          deposeParId: utilSaisie,
        },
      });
    }
  }

  // Applique la règle de retraite obligatoire et, sinon, un parcours aléatoire
  // cohérent avec l'ancienneté. RETOUR_CONGE n'existe plus : un CONGE clos
  // sans mouvement postérieur est désormais le cas normal.
  async function genererEvolution(params: { agentId: string; dateRecrutement: Date; dateNaissance: Date | null }) {
    const { agentId, dateRecrutement, dateNaissance } = params;

    if (dateNaissance && dateNaissance.getFullYear() < 1966) {
      const margeMin = auPlusTard(ajouterMois(dateRecrutement, 6), maintenant);
      await prisma.mouvement.create({
        data: {
          agentId,
          type: TypeMouvement.RETRAITE,
          dateEffet: dateAleatoire(margeMin, maintenant),
          motif: "Départ à la retraite",
          saisiParId: utilAdmin,
        },
      });
      return;
    }

    const margeAvantEvolution = ajouterMois(dateRecrutement, 6);
    if (margeAvantEvolution >= maintenant) return; // trop récent pour évoluer

    const tirage = alea();

    if (tirage < 0.35) {
      // Congé clos : dateFin dépassée, aucun mouvement postérieur (cas courant).
      const debutConge = dateAleatoire(margeAvantEvolution, maintenant);
      const finConge = auPlusTard(ajouterMois(debutConge, entierAleatoire(1, 2)), maintenant);
      await prisma.mouvement.create({
        data: {
          agentId,
          type: TypeMouvement.CONGE,
          dateEffet: debutConge,
          dateFin: finConge,
          motif: "Congé annuel",
          saisiParId: utilSaisie,
        },
      });
    } else if (tirage < 0.45) {
      // Suspension en cours, aucun FIN_SUSPENSION.
      await prisma.mouvement.create({
        data: {
          agentId,
          type: TypeMouvement.SUSPENSION,
          dateEffet: dateAleatoire(margeAvantEvolution, maintenant),
          dateFin: null,
          motif: "Suspension disciplinaire",
          saisiParId: utilAdmin,
        },
      });
    } else if (tirage < 0.53) {
      // Suspension levée par un FIN_SUSPENSION explicite.
      const debutSuspension = dateAleatoire(margeAvantEvolution, maintenant);
      await prisma.mouvement.create({
        data: {
          agentId,
          type: TypeMouvement.SUSPENSION,
          dateEffet: debutSuspension,
          dateFin: auPlusTard(ajouterMois(debutSuspension, 1), maintenant),
          motif: "Suspension disciplinaire",
          saisiParId: utilAdmin,
        },
      });
      await prisma.mouvement.create({
        data: {
          agentId,
          type: TypeMouvement.FIN_SUSPENSION,
          dateEffet: dateAleatoire(debutSuspension, maintenant),
          motif: "Fin de suspension",
          saisiParId: utilAdmin,
        },
      });
    } else if (tirage < 0.6) {
      await prisma.mouvement.create({
        data: {
          agentId,
          type: TypeMouvement.DEMISSION,
          dateEffet: dateAleatoire(margeAvantEvolution, maintenant),
          motif: "Démission volontaire",
          saisiParId: utilAdmin,
        },
      });
    } else if (tirage < 0.65) {
      await prisma.mouvement.create({
        data: {
          agentId,
          type: TypeMouvement.LICENCIEMENT,
          dateEffet: dateAleatoire(margeAvantEvolution, maintenant),
          motif: "Faute grave",
          saisiParId: utilAdmin,
        },
      });
    } else if (tirage < 0.68) {
      await prisma.mouvement.create({
        data: {
          agentId,
          type: TypeMouvement.DECES,
          dateEffet: dateAleatoire(margeAvantEvolution, maintenant),
          motif: null,
          saisiParId: utilAdmin,
        },
      });
    }
    // Au-delà de 0.68 : reste simplement actif depuis son recrutement.
  }

  console.log("Agents (parcours aléatoires)...");
  for (let i = 0; i < 25; i++) {
    const sexe = alea() < 0.55 ? Sexe.FEMININ : Sexe.MASCULIN;
    const prenom = choisir(sexe === Sexe.FEMININ ? PRENOMS_FEMININS : PRENOMS_MASCULINS);
    const nom = choisir(NOMS_FAMILLE).toUpperCase();
    const serviceDef = choisir(SERVICES);
    const service = services.find((s) => s.code === serviceDef.code)!;
    const fonction = choisir(FONCTIONS_PAR_SERVICE[serviceDef.code]);
    const typeContrat = tirerTypeContrat();

    // Un stage ne dépasse jamais 2 ans.
    const fenetreRecrutement =
      typeContrat === TypeContrat.STAGE
        ? { debut: ajouterMois(maintenant, -24), fin: ajouterMois(maintenant, -1) }
        : { debut: new Date(maintenant.getFullYear() - 16, 0, 1), fin: ajouterMois(maintenant, -1) };
    const dateRecrutement = dateAleatoire(fenetreRecrutement.debut, fenetreRecrutement.fin);

    const ageAlEmbauche = entierAleatoire(22, 55);
    const dateNaissance = new Date(dateRecrutement);
    dateNaissance.setFullYear(dateNaissance.getFullYear() - ageAlEmbauche);
    dateNaissance.setDate(dateNaissance.getDate() - entierAleatoire(0, 364));

    const matricule = `M-${dateRecrutement.getFullYear()}-${String(i + 1).padStart(3, "0")}`;

    const agent = await prisma.agent.create({
      data: {
        matricule,
        nom,
        prenom,
        sexe,
        dateNaissance,
        lieuNaissance: choisir(VILLES),
        situationMatrimoniale: choisir(SITUATIONS_MATRIMONIALES),
        telephone: `+226 ${entierAleatoire(70, 79)} ${entierAleatoire(10, 99)} ${entierAleatoire(10, 99)} ${entierAleatoire(10, 99)}`,
        adresse: `Secteur ${entierAleatoire(1, 55)}, ${choisir(VILLES)}`,
        numeroCnss: alea() < 0.8 ? String(entierAleatoire(1_000_000_000, 9_999_999_999)) : null,
        fonction,
        dateRecrutement,
        typeContrat,
        serviceId: service.id,
      },
    });

    await prisma.mouvement.create({
      data: {
        agentId: agent.id,
        type: TypeMouvement.RECRUTEMENT,
        dateEffet: dateRecrutement,
        motif: "Recrutement initial",
        saisiParId: utilAdmin,
      },
    });

    await creerDocumentsAgent(agent.id, nom, prenom);
    await genererEvolution({ agentId: agent.id, dateRecrutement, dateNaissance });
  }

  console.log("Agents (cas limites à démontrer)...");

  async function creerAgentScripte(params: {
    seq: number;
    nom: string;
    prenom: string;
    sexe: Sexe;
    serviceCode: (typeof SERVICES)[number]["code"];
    fonction: string;
    typeContrat: TypeContrat;
    dateRecrutement: Date;
    ageAlEmbauche: number;
  }) {
    const { seq, nom, prenom, sexe, serviceCode, fonction, typeContrat, dateRecrutement, ageAlEmbauche } = params;
    const service = services.find((s) => s.code === serviceCode)!;
    const dateNaissance = new Date(dateRecrutement);
    dateNaissance.setFullYear(dateNaissance.getFullYear() - ageAlEmbauche);

    const matricule = `M-${dateRecrutement.getFullYear()}-${String(seq).padStart(3, "0")}`;

    const agent = await prisma.agent.create({
      data: {
        matricule,
        nom: nom.toUpperCase(),
        prenom,
        sexe,
        dateNaissance,
        lieuNaissance: choisir(VILLES),
        situationMatrimoniale: choisir(SITUATIONS_MATRIMONIALES),
        telephone: `+226 ${entierAleatoire(70, 79)} ${entierAleatoire(10, 99)} ${entierAleatoire(10, 99)} ${entierAleatoire(10, 99)}`,
        adresse: `Secteur ${entierAleatoire(1, 55)}, ${choisir(VILLES)}`,
        numeroCnss: String(entierAleatoire(1_000_000_000, 9_999_999_999)),
        fonction,
        dateRecrutement,
        typeContrat,
        serviceId: service.id,
      },
    });

    await prisma.mouvement.create({
      data: {
        agentId: agent.id,
        type: TypeMouvement.RECRUTEMENT,
        dateEffet: dateRecrutement,
        motif: "Recrutement initial",
        saisiParId: utilAdmin,
      },
    });

    await creerDocumentsAgent(agent.id, nom.toUpperCase(), prenom);

    return agent;
  }

  // Cas 1 : CONGE dont la dateFin est dépassée, sans mouvement postérieur.
  const casConge = await creerAgentScripte({
    seq: 26,
    nom: "Ouédraogo",
    prenom: "Salimata",
    sexe: Sexe.FEMININ,
    serviceCode: "URG",
    fonction: "Infirmier d'État",
    typeContrat: TypeContrat.CDI,
    dateRecrutement: new Date(2019, 2, 4),
    ageAlEmbauche: 29,
  });
  await prisma.mouvement.create({
    data: {
      agentId: casConge.id,
      type: TypeMouvement.CONGE,
      dateEffet: new Date(2026, 1, 10),
      dateFin: new Date(2026, 2, 10),
      motif: "Congé annuel",
      saisiParId: utilSaisie,
    },
  });

  // Cas 2 : SUSPENSION en cours (aucun FIN_SUSPENSION).
  const casSuspensionEnCours = await creerAgentScripte({
    seq: 27,
    nom: "Sawadogo",
    prenom: "Boukary",
    sexe: Sexe.MASCULIN,
    serviceCode: "LAB",
    fonction: "Technicien de laboratoire",
    typeContrat: TypeContrat.CDI,
    dateRecrutement: new Date(2021, 8, 15),
    ageAlEmbauche: 34,
  });
  await prisma.mouvement.create({
    data: {
      agentId: casSuspensionEnCours.id,
      type: TypeMouvement.SUSPENSION,
      dateEffet: new Date(2026, 6, 1),
      dateFin: null,
      motif: "Absences répétées non justifiées",
      saisiParId: utilAdmin,
    },
  });

  // Cas 3 : SUSPENSION levée par un FIN_SUSPENSION.
  const casFinSuspension = await creerAgentScripte({
    seq: 28,
    nom: "Kaboré",
    prenom: "Rachidatou",
    sexe: Sexe.FEMININ,
    serviceCode: "ADM",
    fonction: "Agent d'accueil",
    typeContrat: TypeContrat.CDI,
    dateRecrutement: new Date(2018, 4, 20),
    ageAlEmbauche: 26,
  });
  await prisma.mouvement.create({
    data: {
      agentId: casFinSuspension.id,
      type: TypeMouvement.SUSPENSION,
      dateEffet: new Date(2025, 10, 3),
      dateFin: new Date(2025, 11, 3),
      motif: "Manquement au règlement intérieur",
      saisiParId: utilAdmin,
    },
  });
  await prisma.mouvement.create({
    data: {
      agentId: casFinSuspension.id,
      type: TypeMouvement.FIN_SUSPENSION,
      dateEffet: new Date(2025, 11, 15),
      motif: "Fin de suspension",
      saisiParId: utilAdmin,
    },
  });

  // Cas 4 : agent recruté ce mois-ci, sans aucun autre mouvement.
  const debutMoisCourant = new Date(maintenant.getFullYear(), maintenant.getMonth(), 1);
  await creerAgentScripte({
    seq: 29,
    nom: "Traoré",
    prenom: "Issa",
    sexe: Sexe.MASCULIN,
    serviceCode: "PED",
    fonction: "Aide-soignant",
    typeContrat: TypeContrat.CDD,
    dateRecrutement: dateAleatoire(debutMoisCourant, maintenant),
    ageAlEmbauche: 27,
  });

  // Cas 5 : deux congés successifs la même année.
  const casDeuxConges = await creerAgentScripte({
    seq: 30,
    nom: "Compaoré",
    prenom: "Djénéba",
    sexe: Sexe.FEMININ,
    serviceCode: "CARD",
    fonction: "Infirmier Chef",
    typeContrat: TypeContrat.CDI,
    dateRecrutement: new Date(2016, 6, 11),
    ageAlEmbauche: 31,
  });
  await prisma.mouvement.create({
    data: {
      agentId: casDeuxConges.id,
      type: TypeMouvement.CONGE,
      dateEffet: new Date(2025, 1, 3),
      dateFin: new Date(2025, 1, 28),
      motif: "Congé annuel",
      saisiParId: utilSaisie,
    },
  });
  await prisma.mouvement.create({
    data: {
      agentId: casDeuxConges.id,
      type: TypeMouvement.CONGE,
      dateEffet: new Date(2025, 6, 1),
      dateFin: new Date(2025, 6, 31),
      motif: "Congé maladie",
      saisiParId: utilSaisie,
    },
  });

  console.log("Terminé : 5 services, 3 utilisateurs, 30 agents, documents et mouvements associés.");
}

main()
  .catch((erreur) => {
    console.error(erreur);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
