import { createReadStream } from "node:fs";
import { mkdir, rename, rm, stat } from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import busboy from "busboy";
import { Hono } from "hono";
import { config } from "../../config";
import { prisma } from "../../db";
import { MIME_PAR_TYPE } from "../../domain/documents/typeFichier";
import { cheminCorbeille, resoudreCheminAbsolu } from "../../storage/chemins";
import {
  EspaceDisqueInsuffisantErreur,
  FichierTropVolumineuxErreur,
  TypeFichierInvalideErreur,
  ecrireFichierEnFlux,
  type ResultatEcritureFlux,
} from "../../storage/ecritureFlux";
import type { VariablesHono } from "../context";
import { obtenirIp } from "../ip";
import { exigeAuth, exigeRole, gardeChangementMotDePasse } from "../middlewares/auth";

export const routesAgentPhoto = new Hono<{ Variables: VariablesHono }>();

const TAILLE_PHOTO = { largeurMax: 400, hauteurMax: 500, qualiteJpeg: 85 } as const;

interface IssuePhoto {
  resultat: ResultatEcritureFlux | null;
  erreur: unknown;
}

/**
 * Consomme le corps multipart/form-data et retourne le résultat directement
 * (plutôt que de le lire depuis une variable capturée par une fermeture) :
 * ce détour évite un cas où TypeScript perd la trace du type non-nul d'une
 * variable réassignée dans un callback busboy.
 */
async function consommerPhoto(c: { req: { raw: Request } }, agentId: string, contentType: string): Promise<IssuePhoto> {
  const bb = busboy({ headers: { "content-type": contentType }, limits: { files: 1 } });
  // On capture la promesse de traitement elle-même (pas un simple booléen) :
  // bb.on("close") peut se déclencher avant que ce traitement asynchrone ne
  // se termine réellement (flush sharp + écriture disque après la fin du
  // flux d'entrée) — il faut attendre CETTE promesse, pas seulement "close".
  let promesseEcriture: Promise<ResultatEcritureFlux> | null = null;

  const busboyTermine = new Promise<void>((resoudre, rejeter) => {
    bb.on("file", (_nom, fileStream) => {
      // Le drainage en cas d'échec est fait par ecrireFichierEnFlux lui-même
      // (via le même itérateur asynchrone) : ne pas appeler fileStream.resume()
      // ici, ça ferait deadlocker le parsing busboy (constaté empiriquement).
      promesseEcriture = ecrireFichierEnFlux({
        racine: config.documentsRacine,
        sousDossier: `agents-photos/${agentId}`,
        flux: fileStream,
        typesAcceptes: ["JPEG", "PNG"],
        forcerSortieJpeg: true,
        redimensionnementImage: TAILLE_PHOTO,
      });
    });
    bb.on("close", resoudre);
    bb.on("error", rejeter);
  });

  await pipeline(Readable.fromWeb(c.req.raw.body as import("stream/web").ReadableStream), bb);
  await busboyTermine;

  if (!promesseEcriture) {
    return { resultat: null, erreur: null };
  }
  try {
    const resultat = await promesseEcriture;
    return { resultat, erreur: null };
  } catch (erreur) {
    return { resultat: null, erreur };
  }
}

routesAgentPhoto.get("/:id/photo", exigeAuth(), exigeRole("LECTURE"), gardeChangementMotDePasse(), async (c) => {
  const agentId = c.req.param("id");
  const agent = await prisma.agent.findUnique({ where: { id: agentId } });
  if (!agent || !agent.photoPath) {
    return c.json({ error: "Photo introuvable." }, 404);
  }

  const cheminAbsolu = resoudreCheminAbsolu(config.documentsRacine, agent.photoPath);
  let taille: number;
  try {
    taille = (await stat(cheminAbsolu)).size;
  } catch {
    return c.json({ error: "Fichier introuvable sur le serveur." }, 404);
  }

  // La photo est toujours réencodée en JPEG à l'envoi (forcerSortieJpeg),
  // quel que soit le format d'origine — voir consommerPhoto ci-dessous.
  c.header("Content-Type", MIME_PAR_TYPE.JPEG);
  c.header("X-Content-Type-Options", "nosniff");
  c.header("Cache-Control", "private, no-store");
  c.header("Content-Length", String(taille));

  const flux = createReadStream(cheminAbsolu);
  return c.body(Readable.toWeb(flux) as ReadableStream);
});

routesAgentPhoto.put("/:id/photo", exigeAuth(), exigeRole("SAISIE"), gardeChangementMotDePasse(), async (c) => {
  const agentId = c.req.param("id");
  const agent = await prisma.agent.findUnique({ where: { id: agentId } });
  if (!agent || agent.supprimeLe) return c.json({ error: "Agent introuvable." }, 404);

  const contentType = c.req.header("content-type");
  if (!contentType?.startsWith("multipart/form-data")) {
    return c.json({ error: "Requête multipart/form-data attendue." }, 400);
  }
  if (!c.req.raw.body) {
    return c.json({ error: "Corps de requête manquant." }, 400);
  }

  const { resultat, erreur: erreurEcriture } = await consommerPhoto(c, agentId, contentType);

  if (erreurEcriture) {
    if (erreurEcriture instanceof TypeFichierInvalideErreur) {
      return c.json({ error: "Une photo doit être une image JPEG ou PNG." }, 415);
    }
    if (erreurEcriture instanceof FichierTropVolumineuxErreur) {
      return c.json({ error: erreurEcriture.message }, 413);
    }
    if (erreurEcriture instanceof EspaceDisqueInsuffisantErreur) {
      return c.json({ error: erreurEcriture.message }, 507);
    }
    return c.json({ error: "Échec du dépôt de la photo." }, 500);
  }
  if (!resultat) {
    return c.json({ error: "Aucune photo reçue." }, 400);
  }

  const ancienChemin = agent.photoPath;

  try {
    await prisma.agent.update({ where: { id: agentId }, data: { photoPath: resultat.cheminRelatif } });
  } catch (erreurInsertion) {
    await rm(resoudreCheminAbsolu(config.documentsRacine, resultat.cheminRelatif), { force: true });
    return c.json({ error: "Échec de l'enregistrement de la photo." }, 500);
  }

  // Une seule photo par agent : l'ancienne part en corbeille une fois la
  // nouvelle enregistrée avec succès.
  if (ancienChemin) {
    try {
      const source = resoudreCheminAbsolu(config.documentsRacine, ancienChemin);
      const extension = path.extname(ancienChemin).slice(1);
      const uuidFichier = path.basename(ancienChemin, path.extname(ancienChemin));
      const cheminCorbeilleRelatif = cheminCorbeille(new Date().getFullYear(), uuidFichier, extension);
      const cheminCorbeilleAbsolu = resoudreCheminAbsolu(config.documentsRacine, cheminCorbeilleRelatif);
      await mkdir(path.dirname(cheminCorbeilleAbsolu), { recursive: true });
      await stat(source); // ignore si le fichier précédent n'existe déjà plus
      await rename(source, cheminCorbeilleAbsolu);
    } catch {
      // L'ancienne photo n'a pas pu être déplacée (déjà absente, par ex.) :
      // sans conséquence, la nouvelle photo est déjà en place et référencée.
    }
  }

  const utilisateur = c.get("utilisateur");
  await prisma.journal.create({
    data: {
      utilisateurId: utilisateur.id,
      action: "MODIFICATION_PHOTO",
      cibleType: "Agent",
      cibleId: agentId,
      detail: { agentId, type: "PHOTO" },
      adresseIp: obtenirIp(c),
    },
  });

  return c.json({ photoPath: resultat.cheminRelatif });
});
