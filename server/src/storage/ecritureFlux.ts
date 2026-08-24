import { randomUUID } from "node:crypto";
import { createWriteStream } from "node:fs";
import { mkdir, rm, stat } from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import sharp from "sharp";
import {
  EXTENSION_PAR_TYPE,
  MIME_PAR_TYPE,
  detecterTypeFichier,
  type TypeFichierAccepte,
} from "../domain/documents/typeFichier";
import { cheminDocument, resoudreCheminAbsolu } from "./chemins";
import { espaceDisponible } from "./espaceDisque";

export const TAILLE_MAX_OCTETS = 10 * 1024 * 1024;
const OCTETS_SIGNATURE_MIN = 8;

export class TypeFichierInvalideErreur extends Error {}
export class FichierTropVolumineuxErreur extends Error {}
export class EspaceDisqueInsuffisantErreur extends Error {}

export interface RedimensionnementImage {
  largeurMax: number;
  hauteurMax: number;
  qualiteJpeg: number;
}

export interface OptionsEcritureFlux {
  racine: string;
  /** Sous-dossier direct sous {racine}/{annee}/ — l'agentId pour un document. */
  sousDossier: string;
  flux: Readable;
  redimensionnementImage?: RedimensionnementImage;
  /** Restreint les types acceptés (ex: photo d'agent : JPEG/PNG seulement, jamais PDF). */
  typesAcceptes?: readonly TypeFichierAccepte[];
  /** Force la sortie en JPEG même si l'entrée est un PNG (photo d'agent). */
  forcerSortieJpeg?: boolean;
  /** Injectable pour les tests (simuler un disque plein sans en remplir un réel). */
  verifierEspaceDisque?: (chemin: string) => Promise<number>;
}

export interface ResultatEcritureFlux {
  /** Type réellement détecté à l'entrée (avant conversion éventuelle). */
  typeDetecte: TypeFichierAccepte;
  /** Type effectivement écrit sur le disque (diffère si forcerSortieJpeg). */
  typeEcrit: TypeFichierAccepte;
  mimeType: string;
  tailleOctets: number;
  cheminRelatif: string;
}

/**
 * Écrit un flux de fichier sur le disque en respectant, dans cet ordre :
 * type déterminé par les octets d'en-tête, espace disque disponible,
 * plafond de taille appliqué PENDANT le flux (jamais chargé entièrement
 * en mémoire), réencodage sharp pour les images (retire l'EXIF).
 */
export async function ecrireFichierEnFlux(options: OptionsEcritureFlux): Promise<ResultatEcritureFlux> {
  const { racine, sousDossier, flux } = options;
  const iterateur = flux[Symbol.asyncIterator]();
  let fluxTermine = false;

  // Draine le flux via CE MÊME itérateur (jamais fileStream.resume() depuis
  // l'extérieur : mélanger les deux modes de consommation d'un flux busboy
  // fait deadlocker le parsing du corps multipart — busboy n'émet plus
  // jamais "close"). Constaté empiriquement, pas une hypothèse de confort.
  async function drainerRestant(): Promise<void> {
    if (fluxTermine) return;
    while (!(await iterateur.next()).done) {
      /* on ignore le contenu, seul l'épuisement du flux importe */
    }
    fluxTermine = true;
  }

  let premierMorceau = Buffer.alloc(0);
  while (premierMorceau.length < OCTETS_SIGNATURE_MIN) {
    const resultat = await iterateur.next();
    if (resultat.done) {
      fluxTermine = true;
      break;
    }
    premierMorceau = Buffer.concat([premierMorceau, Buffer.from(resultat.value as Uint8Array)]);
  }

  try {
    const type = detecterTypeFichier(premierMorceau);
    const typesAcceptes = options.typesAcceptes ?? (["PDF", "JPEG", "PNG"] as const);
    if (!type || !typesAcceptes.includes(type)) {
      const noms = typesAcceptes.join(", ");
      throw new TypeFichierInvalideErreur(`Type de fichier non accepté (seuls ${noms} sont autorisés).`);
    }
    const typeEcrit: TypeFichierAccepte = options.forcerSortieJpeg && type !== "PDF" ? "JPEG" : type;

    // La racine doit exister avant de pouvoir la statfs (premier dépôt sur un
    // environnement neuf, avant tout mkdir récursif plus bas).
    await mkdir(racine, { recursive: true });
    const espaceLibre = await (options.verifierEspaceDisque ?? espaceDisponible)(racine);
    if (espaceLibre < TAILLE_MAX_OCTETS) {
      throw new EspaceDisqueInsuffisantErreur("Espace disque insuffisant sur le serveur pour recevoir ce fichier.");
    }

    const annee = new Date().getFullYear();
    const uuid = randomUUID();
    const extension = EXTENSION_PAR_TYPE[typeEcrit];
    const cheminRelatif = cheminDocument(annee, sousDossier, uuid, extension);
    const cheminAbsolu = resoudreCheminAbsolu(racine, cheminRelatif);
    await mkdir(path.dirname(cheminAbsolu), { recursive: true });

    async function* octetsRestants(): AsyncGenerator<Buffer> {
      yield premierMorceau;
      if (fluxTermine) return;
      while (true) {
        const { value, done: termine } = await iterateur.next();
        if (termine) {
          fluxTermine = true;
          return;
        }
        yield Buffer.from(value as Uint8Array);
      }
    }

    let octetsRecus = 0;
    async function* limiterTaille(source: AsyncGenerator<Buffer>): AsyncGenerator<Buffer> {
      for await (const morceau of source) {
        octetsRecus += morceau.length;
        if (octetsRecus > TAILLE_MAX_OCTETS) {
          throw new FichierTropVolumineuxErreur(
            `Fichier trop volumineux (maximum ${TAILLE_MAX_OCTETS / (1024 * 1024)} Mo).`,
          );
        }
        yield morceau;
      }
    }

    const fluxLimite = Readable.from(limiterTaille(octetsRestants()));
    const ecriture = createWriteStream(cheminAbsolu);

    try {
      if (type === "PDF") {
        await pipeline(fluxLimite, ecriture);
      } else {
        const redim = options.redimensionnementImage;
        // .rotate() sans argument applique l'orientation EXIF puis, comme on
        // n'appelle jamais .withMetadata(), la sortie ne conserve aucune
        // métadonnée (EXIF/GPS compris).
        const transformateur = sharp().rotate();
        if (redim) {
          transformateur.resize({
            width: redim.largeurMax,
            height: redim.hauteurMax,
            fit: "inside",
            withoutEnlargement: true,
          });
        }
        if (typeEcrit === "JPEG") {
          transformateur.jpeg({ quality: redim?.qualiteJpeg ?? 90 });
        } else {
          transformateur.png();
        }
        await pipeline(fluxLimite, transformateur, ecriture);
      }
    } catch (erreur) {
      await rm(cheminAbsolu, { force: true });
      throw erreur;
    }

    const infos = await stat(cheminAbsolu);

    return {
      typeDetecte: type,
      typeEcrit,
      mimeType: MIME_PAR_TYPE[typeEcrit],
      tailleOctets: infos.size,
      cheminRelatif,
    };
  } catch (erreur) {
    await drainerRestant();
    throw erreur;
  }
}
