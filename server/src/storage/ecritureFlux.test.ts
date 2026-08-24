import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { Readable } from "node:stream";
import sharp from "sharp";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  EspaceDisqueInsuffisantErreur,
  FichierTropVolumineuxErreur,
  TypeFichierInvalideErreur,
  TAILLE_MAX_OCTETS,
  ecrireFichierEnFlux,
} from "./ecritureFlux";

let racine: string;

beforeEach(async () => {
  racine = await mkdtemp(path.join(tmpdir(), "hosco-documents-"));
});

afterEach(async () => {
  await rm(racine, { recursive: true, force: true });
});

// L'API simplifiée withExif() de sharp (types IFD0-IFD3 uniquement) ne
// permet pas d'écrire des tags GPS structurés directement. On vérifie donc
// le retrait EXIF de façon générale (IFD0, où vivraient aussi les tags
// GPS réels d'une photo de téléphone) : le code ne fait aucune distinction
// entre "GPS" et le reste des métadonnées — .withMetadata() n'est jamais
// appelé, donc rien n'est jamais conservé, GPS compris.
async function jpegAvecExif(): Promise<Buffer> {
  return sharp({ create: { width: 40, height: 30, channels: 3, background: { r: 200, g: 20, b: 20 } } })
    .jpeg()
    .withExif({
      IFD0: { Make: "TestCam", GPSLatitude: "48,51,0N", GPSLongitude: "2,21,0E" },
    })
    .toBuffer();
}

async function pngSimple(): Promise<Buffer> {
  return sharp({ create: { width: 30, height: 30, channels: 4, background: { r: 10, g: 200, b: 10, alpha: 1 } } })
    .png()
    .toBuffer();
}

describe("ecrireFichierEnFlux", () => {
  it("écrit un PDF valide sur le disque", async () => {
    const contenu = Buffer.from("%PDF-1.4\n1 0 obj\n<< >>\nendobj\n%%EOF");
    const resultat = await ecrireFichierEnFlux({ racine, sousDossier: "agent-1", flux: Readable.from(contenu) });

    expect(resultat.typeDetecte).toBe("PDF");
    expect(resultat.typeEcrit).toBe("PDF");
    expect(resultat.mimeType).toBe("application/pdf");
    expect(resultat.cheminRelatif).toMatch(/^\d{4}\/agent-1\/[0-9a-f-]+\.pdf$/);

    const surDisque = await readFile(path.join(racine, resultat.cheminRelatif));
    expect(surDisque.equals(contenu)).toBe(true);
  });

  it("écrit un JPEG et retire effectivement l'EXIF (dont les coordonnées GPS)", async () => {
    const original = await jpegAvecExif();
    const metaOriginale = await sharp(original).metadata();
    expect(metaOriginale.exif).toBeDefined(); // la fixture contient bien de l'EXIF au départ
    expect(metaOriginale.exif!.length).toBeGreaterThan(0);

    const resultat = await ecrireFichierEnFlux({ racine, sousDossier: "agent-2", flux: Readable.from(original) });
    expect(resultat.typeDetecte).toBe("JPEG");

    const surDisque = await readFile(path.join(racine, resultat.cheminRelatif));
    const metaFinale = await sharp(surDisque).metadata();
    expect(metaFinale.exif).toBeUndefined();
  });

  it("écrit un PNG et le redimensionne quand demandé", async () => {
    const original = await pngSimple(); // 30x30
    const resultat = await ecrireFichierEnFlux({
      racine,
      sousDossier: "agent-3",
      flux: Readable.from(original),
      redimensionnementImage: { largeurMax: 10, hauteurMax: 10, qualiteJpeg: 85 },
    });
    const surDisque = await readFile(path.join(racine, resultat.cheminRelatif));
    const meta = await sharp(surDisque).metadata();
    expect(meta.width).toBeLessThanOrEqual(10);
    expect(meta.height).toBeLessThanOrEqual(10);
  });

  it("photo : convertit un PNG en JPEG quand forcerSortieJpeg est activé", async () => {
    const original = await pngSimple();
    const resultat = await ecrireFichierEnFlux({
      racine,
      sousDossier: "agent-photo",
      flux: Readable.from(original),
      typesAcceptes: ["JPEG", "PNG"],
      forcerSortieJpeg: true,
      redimensionnementImage: { largeurMax: 400, hauteurMax: 500, qualiteJpeg: 85 },
    });
    expect(resultat.typeDetecte).toBe("PNG");
    expect(resultat.typeEcrit).toBe("JPEG");
    expect(resultat.cheminRelatif).toMatch(/\.jpg$/);
    const meta = await sharp(await readFile(path.join(racine, resultat.cheminRelatif))).metadata();
    expect(meta.format).toBe("jpeg");
  });

  it("photo : refuse un PDF (typesAcceptes restreint à JPEG/PNG)", async () => {
    const contenu = Buffer.from("%PDF-1.4\n%%EOF");
    await expect(
      ecrireFichierEnFlux({
        racine,
        sousDossier: "agent-photo-2",
        flux: Readable.from(contenu),
        typesAcceptes: ["JPEG", "PNG"],
      }),
    ).rejects.toBeInstanceOf(TypeFichierInvalideErreur);
  });

  it("refuse un .exe renommé en .pdf (magic bytes) sans laisser de fichier orphelin", async () => {
    const enteteExe = Buffer.from([0x4d, 0x5a, 0x90, 0x00, 0x03, 0x00, 0x00, 0x00, 0x04, 0x00]);
    await expect(
      ecrireFichierEnFlux({ racine, sousDossier: "agent-4", flux: Readable.from(enteteExe) }),
    ).rejects.toBeInstanceOf(TypeFichierInvalideErreur);

    // Aucun sous-dossier n'a même dû être créé : le rejet a lieu avant toute écriture.
    const contenu = await listerRecursivement(racine);
    expect(contenu).toEqual([]);
  });

  it("refuse un fichier de plus de 10 Mo PENDANT le flux, sans jamais le charger en mémoire", async () => {
    // 2 Go déclarés, générés à la volée par morceaux de 64 Ko — jamais
    // assemblés en un seul buffer. Le rejet est détecté dès le dépassement
    // des 10 Mo ; le reste du flux est ensuite drainé (nécessaire pour que
    // busboy termine proprement son analyse côté HTTP, voir consommerMultipart),
    // mais un seul morceau à la fois est jamais gardé en mémoire.
    const totalDeclare = 2 * 1024 * 1024 * 1024;
    let octetsGeneres = 0;
    let pointeDepassement: number | null = null;

    async function* fluxEnorme() {
      const enTete = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]); // signature PNG
      octetsGeneres += enTete.length;
      yield enTete;
      const tailleMorceau = 65536;
      while (octetsGeneres < totalDeclare) {
        const taille = Math.min(tailleMorceau, totalDeclare - octetsGeneres);
        octetsGeneres += taille;
        if (pointeDepassement === null && octetsGeneres > TAILLE_MAX_OCTETS) {
          pointeDepassement = octetsGeneres;
        }
        yield Buffer.alloc(taille, 0x00);
      }
    }

    const heapAvant = process.memoryUsage().heapUsed;
    await expect(
      ecrireFichierEnFlux({ racine, sousDossier: "agent-5", flux: Readable.from(fluxEnorme()) }),
    ).rejects.toBeInstanceOf(FichierTropVolumineuxErreur);
    const heapApres = process.memoryUsage().heapUsed;

    // Le rejet a bien eu lieu juste après avoir dépassé 10 Mo (pas après
    // avoir tout consommé) ; le drainage du reste vient après coup.
    expect(pointeDepassement).not.toBeNull();
    expect(pointeDepassement!).toBeLessThan(TAILLE_MAX_OCTETS + 65536 * 2);

    // Le tas n'a pas grossi de l'ordre du fichier "de 2 Go" généré : preuve
    // qu'aucun buffer unique n'a accumulé le flux entier.
    expect(heapApres - heapAvant).toBeLessThan(50 * 1024 * 1024);

    const contenu = await listerRecursivement(racine);
    expect(contenu).toEqual([]);
  });

  it("refuse en 507 (espace disque insuffisant) sans écrire sur le disque", async () => {
    const contenu = Buffer.from("%PDF-1.4\n%%EOF");
    await expect(
      ecrireFichierEnFlux({
        racine,
        sousDossier: "agent-6",
        flux: Readable.from(contenu),
        verifierEspaceDisque: async () => 1024, // 1 Ko libre, très en dessous du plafond
      }),
    ).rejects.toBeInstanceOf(EspaceDisqueInsuffisantErreur);

    const contenuDisque = await listerRecursivement(racine);
    expect(contenuDisque).toEqual([]);
  });
});

async function listerRecursivement(dossier: string): Promise<string[]> {
  const { readdir } = await import("node:fs/promises");
  const resultats: string[] = [];
  async function parcourir(courant: string) {
    const entrees = await readdir(courant, { withFileTypes: true }).catch(() => []);
    for (const entree of entrees) {
      const chemin = path.join(courant, entree.name);
      if (entree.isDirectory()) await parcourir(chemin);
      else resultats.push(chemin);
    }
  }
  await parcourir(dossier);
  return resultats;
}
