import { prisma } from "../db";

const INTERVALLE_MS = 60 * 60 * 1000;
const RETENTION_JOURNAL_MOIS = 24;

export async function nettoyerSessionsExpirees(maintenant = new Date()): Promise<number> {
  const resultat = await prisma.session.deleteMany({ where: { expireLe: { lt: maintenant } } });
  return resultat.count;
}

export async function purgerJournalAncien(maintenant = new Date()): Promise<number> {
  const limite = new Date(maintenant);
  limite.setMonth(limite.getMonth() - RETENTION_JOURNAL_MOIS);
  const resultat = await prisma.journal.deleteMany({ where: { createdAt: { lt: limite } } });
  return resultat.count;
}

export async function executerNettoyage(): Promise<void> {
  const maintenant = new Date();
  const sessions = await nettoyerSessionsExpirees(maintenant);
  const journal = await purgerJournalAncien(maintenant);
  console.log(`Nettoyage périodique : ${sessions} session(s) expirée(s), ${journal} entrée(s) de journal purgée(s).`);
}

export function demarrerNettoyagePeriodique(): NodeJS.Timeout {
  return setInterval(() => {
    executerNettoyage().catch((erreur: unknown) => console.error("Échec du nettoyage périodique :", erreur));
  }, INTERVALLE_MS);
}
