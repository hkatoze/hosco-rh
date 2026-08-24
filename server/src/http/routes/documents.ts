import { createReadStream } from "node:fs";
import { mkdir, rename, rm, stat } from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import busboy from "busboy";
import { Hono, type Context } from "hono";
import { z } from "zod";
import { config } from "../../config";
import { prisma } from "../../db";
import { cheminCorbeille, resoudreCheminAbsolu } from "../../storage/chemins";
import {
  EspaceDisqueInsuffisantErreur,
  FichierTropVolumineuxErreur,
  TypeFichierInvalideErreur,
  ecrireFichierEnFlux,
} from "../../storage/ecritureFlux";
import { nettoyerNomFichier } from "../../domain/documents/nomFichier";
import { schemaTypeDocument } from "../../../../shared/document";
import type { VariablesHono } from "../context";
import { obtenirIp } from "../ip";
import { exigeAuth, exigeRole, gardeChangementMotDePasse } from "../middlewares/auth";

export const routesDocumentsAgent = new Hono<{ Variables: VariablesHono }>();
export const routesDocuments = new Hono<{ Variables: VariablesHono }>();

type ContexteDocument = Context<{ Variables: VariablesHono }>;

function estUuid(valeur: string): boolean {
  return z.string().uuid().safeParse(valeur).success;
}

function reponseErreurEcriture(erreur: unknown): { corps: { error: string }; statut: 415 | 413 | 507 | 500 } {
  if (erreur instanceof TypeFichierInvalideErreur) return { corps: { error: erreur.message }, statut: 415 };
  if (erreur instanceof FichierTropVolumineuxErreur) return { corps: { error: erreur.message }, statut: 413 };
  if (erreur instanceof EspaceDisqueInsuffisantErreur) return { corps: { error: erreur.message }, statut: 507 };
  return { corps: { error: "Échec du dépôt du fichier." }, statut: 500 };
}

interface ChampsMultipart {
  type?: string;
}

/**
 * Consomme un corps multipart/form-data en flux et délègue l'unique
 * partie fichier à `traiterFichier`. Rejette si le Content-Type n'est
 * pas multipart, ou si aucun fichier n'a été transmis.
 */
interface ResultatMultipart<T> {
  champs: ChampsMultipart;
  nomOrigineBrut: string;
  resultatFichier: T | null;
  erreurFichier: unknown;
}

async function consommerMultipart<T>(
  c: ContexteDocument,
  traiterFichier: (fluxFichier: Readable, nomOrigineBrut: string) => Promise<T>,
): Promise<ResultatMultipart<T>> {
  const contentType = c.req.header("content-type");
  if (!contentType?.startsWith("multipart/form-data")) {
    throw new Error("CONTENT_TYPE_INVALIDE");
  }
  if (!c.req.raw.body) {
    throw new Error("CORPS_MANQUANT");
  }

  const champs: ChampsMultipart = {};
  let nomOrigineBrut = "";
  // On capture la promesse de traitement elle-même (pas un simple booléen) :
  // bb.on("close") peut se déclencher avant que ce traitement asynchrone ne
  // se termine réellement (flux + écriture disque après la fin du flux
  // d'entrée) — il faut attendre CETTE promesse, pas seulement "close".
  let promesseFichier: Promise<T> | null = null;

  const bb = busboy({ headers: { "content-type": contentType }, limits: { files: 1 } });

  const busboyTermine = new Promise<void>((resoudre, rejeter) => {
    bb.on("field", (nom, valeur) => {
      if (nom === "type") champs.type = valeur;
    });

    bb.on("file", (_nom, fileStream, info) => {
      nomOrigineBrut = info.filename;
      // Le drainage en cas d'échec est fait par ecrireFichierEnFlux lui-même
      // (via le même itérateur asynchrone) : ne pas appeler fileStream.resume()
      // ici, ça ferait deadlocker le parsing busboy (constaté empiriquement).
      promesseFichier = traiterFichier(fileStream, info.filename);
    });

    bb.on("close", resoudre);
    bb.on("error", rejeter);
  });

  await pipeline(Readable.fromWeb(c.req.raw.body as import("stream/web").ReadableStream), bb);
  await busboyTermine;

  if (!promesseFichier) {
    throw new Error("AUCUN_FICHIER");
  }

  let resultatFichier: T | null = null;
  let erreurFichier: unknown = null;
  try {
    resultatFichier = await promesseFichier;
  } catch (erreur) {
    erreurFichier = erreur;
  }

  return { champs, nomOrigineBrut, resultatFichier, erreurFichier };
}

routesDocumentsAgent.post("/:id/documents", exigeAuth(), exigeRole("SAISIE"), gardeChangementMotDePasse(), async (c) => {
  const agentId = c.req.param("id");
  if (!estUuid(agentId)) return c.json({ error: "Identifiant invalide." }, 400);

  const agent = await prisma.agent.findUnique({ where: { id: agentId } });
  if (!agent || agent.supprimeLe) return c.json({ error: "Agent introuvable." }, 404);

  let resultat: Awaited<ReturnType<typeof consommerMultipart<Awaited<ReturnType<typeof ecrireFichierEnFlux>>>>>;
  try {
    resultat = await consommerMultipart(c, (fluxFichier) =>
      ecrireFichierEnFlux({ racine: config.documentsRacine, sousDossier: agentId, flux: fluxFichier }),
    );
  } catch (erreur) {
    if (erreur instanceof Error && erreur.message === "CONTENT_TYPE_INVALIDE") {
      return c.json({ error: "Requête multipart/form-data attendue." }, 400);
    }
    if (erreur instanceof Error && erreur.message === "AUCUN_FICHIER") {
      return c.json({ error: "Aucun fichier reçu." }, 400);
    }
    return c.json({ error: "Requête invalide." }, 400);
  }
  const { champs, nomOrigineBrut, resultatFichier: ecriture, erreurFichier } = resultat;

  if (erreurFichier) {
    const { corps, statut } = reponseErreurEcriture(erreurFichier);
    return c.json(corps, statut);
  }
  if (!ecriture) {
    return c.json({ error: "Aucun fichier reçu." }, 400);
  }

  const analyseType = schemaTypeDocument.safeParse(champs.type);
  const utilisateur = c.get("utilisateur");
  const cheminAbsoluEcrit = resoudreCheminAbsolu(config.documentsRacine, ecriture.cheminRelatif);

  if (!analyseType.success) {
    await nettoyerFichierOrphelin(cheminAbsoluEcrit, "type de document manquant ou invalide", utilisateur.id, c);
    return c.json({ error: "Le champ 'type' est requis (CV, DIPLOME, CONTRAT, CNIB, ACTE_NAISSANCE, CERTIFICAT_MEDICAL ou AUTRE)." }, 400);
  }

  try {
    const document = await prisma.document.create({
      data: {
        agentId,
        type: analyseType.data,
        nomOrigine: nettoyerNomFichier(nomOrigineBrut),
        cheminFichier: ecriture.cheminRelatif,
        tailleOctets: ecriture.tailleOctets,
        mimeType: ecriture.mimeType,
        deposeParId: utilisateur.id,
      },
    });

    await prisma.journal.create({
      data: {
        utilisateurId: utilisateur.id,
        action: "AJOUT_DOCUMENT",
        cibleType: "Document",
        cibleId: document.id,
        detail: { agentId, type: document.type },
        adresseIp: obtenirIp(c),
      },
    });

    return c.json(
      { id: document.id, type: document.type, nomOrigine: document.nomOrigine, tailleOctets: document.tailleOctets, mimeType: document.mimeType },
      201,
    );
  } catch (erreurInsertion) {
    // Ordre des opérations : le fichier est déjà écrit, l'insertion en base
    // a échoué. On supprime le fichier ; si la suppression échoue aussi, on
    // le journalise plutôt que de le laisser disparaître silencieusement.
    await nettoyerFichierOrphelin(cheminAbsoluEcrit, "échec de l'insertion en base", utilisateur.id, c, erreurInsertion);
    return c.json({ error: "Échec de l'enregistrement du document." }, 500);
  }
});

async function nettoyerFichierOrphelin(
  cheminAbsolu: string,
  raison: string,
  utilisateurId: string,
  c: ContexteDocument,
  erreurOrigine?: unknown,
): Promise<void> {
  try {
    await rm(cheminAbsolu, { force: true });
  } catch (erreurSuppression) {
    await prisma.journal.create({
      data: {
        utilisateurId,
        action: "ERREUR_NETTOYAGE_FICHIER",
        cibleType: "Document",
        detail: {
          cheminAbsolu,
          raison,
          erreurOrigine: erreurOrigine instanceof Error ? erreurOrigine.message : null,
          erreurSuppression: erreurSuppression instanceof Error ? erreurSuppression.message : String(erreurSuppression),
        },
        adresseIp: obtenirIp(c),
      },
    });
  }
}

routesDocuments.get("/:id/fichier", exigeAuth(), exigeRole("LECTURE"), gardeChangementMotDePasse(), async (c) => {
  const id = c.req.param("id");
  if (!estUuid(id)) return c.json({ error: "Identifiant invalide." }, 400);

  const document = await prisma.document.findUnique({ where: { id } });
  if (!document || document.supprimeLe) {
    return c.json({ error: "Document introuvable." }, 404);
  }

  const cheminAbsolu = resoudreCheminAbsolu(config.documentsRacine, document.cheminFichier);
  let taille: number;
  try {
    taille = (await stat(cheminAbsolu)).size;
  } catch {
    return c.json({ error: "Fichier introuvable sur le serveur." }, 404);
  }

  const utilisateur = c.get("utilisateur");
  await prisma.journal.create({
    data: {
      utilisateurId: utilisateur.id,
      action: "CONSULTATION_DOCUMENT",
      cibleType: "Document",
      cibleId: document.id,
      detail: { agentId: document.agentId, type: document.type },
      adresseIp: obtenirIp(c),
    },
  });

  const nomAffiche = encodeURIComponent(document.nomOrigine);
  c.header("Content-Type", document.mimeType);
  c.header("X-Content-Type-Options", "nosniff");
  c.header("Content-Disposition", `inline; filename*=UTF-8''${nomAffiche}`);
  c.header("Cache-Control", "private, no-store");
  c.header("Content-Length", String(taille));

  const flux = createReadStream(cheminAbsolu);
  return c.body(Readable.toWeb(flux) as ReadableStream);
});

routesDocuments.delete("/:id", exigeAuth(), exigeRole("ADMIN"), gardeChangementMotDePasse(), async (c) => {
  const id = c.req.param("id");
  if (!estUuid(id)) return c.json({ error: "Identifiant invalide." }, 400);

  const document = await prisma.document.findUnique({ where: { id } });
  if (!document || document.supprimeLe) {
    return c.json({ error: "Document introuvable." }, 404);
  }

  const cheminSource = resoudreCheminAbsolu(config.documentsRacine, document.cheminFichier);
  const extension = path.extname(document.cheminFichier).slice(1);
  const uuidFichier = path.basename(document.cheminFichier, path.extname(document.cheminFichier));
  const anneeSuppression = new Date().getFullYear();
  const cheminCorbeilleRelatif = cheminCorbeille(anneeSuppression, uuidFichier, extension);
  const cheminCorbeilleAbsolu = resoudreCheminAbsolu(config.documentsRacine, cheminCorbeilleRelatif);

  await mkdir(path.dirname(cheminCorbeilleAbsolu), { recursive: true });
  await rename(cheminSource, cheminCorbeilleAbsolu);

  const utilisateur = c.get("utilisateur");
  const documentMisAJour = await prisma.document.update({
    where: { id },
    data: { cheminFichier: cheminCorbeilleRelatif, supprimeLe: new Date(), supprimeParId: utilisateur.id },
  });

  await prisma.journal.create({
    data: {
      utilisateurId: utilisateur.id,
      action: "SUPPRESSION_DOCUMENT",
      cibleType: "Document",
      cibleId: documentMisAJour.id,
      detail: { agentId: documentMisAJour.agentId, type: documentMisAJour.type },
      adresseIp: obtenirIp(c),
    },
  });

  return c.json({ ok: true });
});
