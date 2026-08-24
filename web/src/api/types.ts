import type { Sexe, SituationMatrimoniale, TypeContrat } from "../../../shared/agent";
import type { TypeMouvement } from "../../../shared/mouvement";
import type { TypeDocument } from "../../../shared/document";

export type { Sexe, SituationMatrimoniale, TypeContrat, TypeMouvement, TypeDocument };

export type RoleUtilisateur = "LECTURE" | "SAISIE" | "ADMIN";

export interface UtilisateurConnecte {
  id: string;
  identifiant: string;
  nom: string;
  role: RoleUtilisateur;
  actif: boolean;
  doitChangerMotDePasse: boolean;
}

export type StatutAgent =
  | "PRESENT"
  | "EN_CONGE"
  | "CONGE_DEPASSE"
  | "SUSPENDU"
  | "DEMISSIONNE"
  | "LICENCIE"
  | "RETRAITE"
  | "DECEDE";

export interface ServiceResume {
  id: string;
  nom: string;
  code: string;
}

export interface AgentListe {
  id: string;
  matricule: string;
  nom: string;
  prenom: string;
  fonction: string;
  typeContrat: TypeContrat;
  dateRecrutement: string;
  statut: StatutAgent;
  service: ServiceResume;
}

export interface PageAgents {
  donnees: AgentListe[];
  page: number;
  taille: number;
  total: number;
}

export interface ServiceAvecEffectif {
  id: string;
  nom: string;
  code: string;
  actif: boolean;
  agentsPresents: number;
}

export interface Anomalie {
  id: string;
  matricule: string;
  nom: string;
  prenom: string;
  service: string;
  dateFinConge: string;
  joursDepassement: number;
}

export interface DocumentAgent {
  id: string;
  type: TypeDocument;
  nomOrigine: string;
  tailleOctets: number;
  mimeType: string;
  createdAt: string;
}

export interface Mouvement {
  id: string;
  agentId: string;
  type: TypeMouvement;
  dateEffet: string;
  dateFin: string | null;
  motif: string | null;
  documentId: string | null;
  saisiParId: string;
  saisiPar: { nom: string };
  createdAt: string;
  annuleLe: string | null;
  annuleParId: string | null;
  annulePar: { nom: string } | null;
  motifAnnulation: string | null;
}

export interface ServiceAdmin {
  id: string;
  nom: string;
  code: string;
  actif: boolean;
  effectif: number;
}

export interface UtilisateurAdmin {
  id: string;
  identifiant: string;
  nom: string;
  role: RoleUtilisateur;
  actif: boolean;
  doitChangerMotDePasse: boolean;
  dernierAcces: string | null;
  createdAt: string;
}

export interface UtilisateurCree extends UtilisateurAdmin {
  motDePasseTemporaire: string;
}

export interface CorbeilleDocument {
  id: string;
  type: TypeDocument;
  nomOrigine: string;
  agent: { id: string; nom: string; prenom: string; matricule: string };
  supprimeLe: string;
  supprimePar: string | null;
  joursRestants: number;
}

export interface CorbeilleAgent {
  id: string;
  matricule: string;
  nom: string;
  prenom: string;
  supprimeLe: string;
  supprimePar: string | null;
  joursRestants: number;
}

export interface Corbeille {
  documents: CorbeilleDocument[];
  agents: CorbeilleAgent[];
}

export interface RepartitionService {
  nom: string;
  effectif: number;
  pourcentage: number;
}

export interface TableauDeBordDonnees {
  totalPersonnel: number;
  totalPersonnelVariation: number;
  arriveesMois: number;
  arriveesMoisPrecedent: number;
  departsMois: number;
  departsMoisPrecedent: number;
  tauxAbsence: number;
  repartitionParService: RepartitionService[];
}

export interface MouvementListe {
  id: string;
  type: TypeMouvement;
  dateEffet: string;
  dateFin: string | null;
  motif: string | null;
  createdAt: string;
  annuleLe: string | null;
  motifAnnulation: string | null;
  agent: { id: string; nom: string; prenom: string; matricule: string };
  service: string;
  saisiPar: string;
  annulePar: string | null;
}

export interface PageMouvements {
  donnees: MouvementListe[];
  page: number;
  taille: number;
  total: number;
}

export interface AgentDetail {
  id: string;
  matricule: string;
  nom: string;
  prenom: string;
  sexe: Sexe;
  dateNaissance: string | null;
  lieuNaissance: string | null;
  situationMatrimoniale: SituationMatrimoniale | null;
  telephone: string | null;
  adresse: string | null;
  numeroCnss: string | null;
  fonction: string;
  dateRecrutement: string;
  typeContrat: TypeContrat;
  photoPath: string | null;
  serviceId: string;
  service: ServiceResume;
  statut: StatutAgent;
  mouvements: Mouvement[];
  documents: DocumentAgent[];
}
