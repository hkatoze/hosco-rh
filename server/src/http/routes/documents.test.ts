import { randomUUID } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import sharp from "sharp";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { config } from "../../config";
import { prisma } from "../../db";
import { hacherMotDePasse } from "../../domain/auth/motDePasse";
import { limiteurConnexion } from "../../domain/auth/limiteurConnexion";
import { creerApp } from "../app";

const ORIGINE = "http://localhost:5173";
const app = creerApp();

interface CorpsErreur {
  error?: string;
  code?: string;
}
interface CorpsDocument {
  id: string;
  nomOrigine: string;
}

function entetesJson(cookie?: string): Record<string, string> {
  const en: Record<string, string> = { "Content-Type": "application/json", Origin: ORIGINE };
  if (cookie) en.Cookie = cookie;
  return en;
}

async function poster(chemin: string, corps: unknown, cookie?: string) {
  return app.request(chemin, { method: "POST", headers: entetesJson(cookie), body: JSON.stringify(corps) });
}

function extraireCookie(res: Response): string | undefined {
  return res.headers.get("set-cookie")?.split(";")[0];
}

async function json<T>(res: Response): Promise<T> {
  return (await res.json()) as T;
}

async function connecter(identifiant: string, motDePasse: string): Promise<string> {
  const res = await poster("/api/auth/connexion", { identifiant, motDePasse });
  const cookie = extraireCookie(res);
  if (!cookie) throw new Error(`Connexion impossible pour ${identifiant} (statut ${res.status})`);
  return cookie;
}

async function posterFichier(chemin: string, champs: Record<string, string>, fichier: { nom: string; contenu: Buffer; type: string }, cookie: string) {
  const form = new FormData();
  for (const [cle, valeur] of Object.entries(champs)) form.append(cle, valeur);
  form.append("fichier", new Blob([fichier.contenu], { type: fichier.type }), fichier.nom);
  return app.request(chemin, { method: "POST", headers: { Origin: ORIGINE, Cookie: cookie }, body: form });
}

async function jpegAvecExif(): Promise<Buffer> {
  return sharp({ create: { width: 40, height: 30, channels: 3, background: { r: 200, g: 20, b: 20 } } })
    .jpeg()
    .withExif({ IFD0: { Make: "TestCam", GPSLatitude: "48,51,0N" } })
    .toBuffer();
}

describe("routes documents", () => {
  const identifiantSaisie = `test.doc.saisie.${randomUUID().slice(0, 8)}`;
  const identifiantLecture = `test.doc.lecture.${randomUUID().slice(0, 8)}`;
  const identifiantAdmin = `test.doc.admin.${randomUUID().slice(0, 8)}`;
  const motDePasse = "MotDePasseValide1";
  let utilisateurSaisieId: string;
  let utilisateurLectureId: string;
  let utilisateurAdminId: string;
  let serviceId: string;
  let agentId: string;
  let racineOriginale: string;

  beforeAll(async () => {
    racineOriginale = config.documentsRacine;
    config.documentsRacine = await mkdtemp(path.join(tmpdir(), "hosco-documents-http-"));

    const hash = await hacherMotDePasse(motDePasse);
    const [saisie, lecture, admin] = await Promise.all([
      prisma.utilisateur.create({ data: { identifiant: identifiantSaisie, nom: "T", motDePasseHash: hash, role: "SAISIE", actif: true, doitChangerMotDePasse: false } }),
      prisma.utilisateur.create({ data: { identifiant: identifiantLecture, nom: "T", motDePasseHash: hash, role: "LECTURE", actif: true, doitChangerMotDePasse: false } }),
      prisma.utilisateur.create({ data: { identifiant: identifiantAdmin, nom: "T", motDePasseHash: hash, role: "ADMIN", actif: true, doitChangerMotDePasse: false } }),
    ]);
    utilisateurSaisieId = saisie.id;
    utilisateurLectureId = lecture.id;
    utilisateurAdminId = admin.id;

    const service = await prisma.service.create({ data: { nom: `Service Test ${randomUUID().slice(0, 6)}`, code: `TST${randomUUID().slice(0, 6)}`, actif: true } });
    serviceId = service.id;
  });

  afterAll(async () => {
    await rm(config.documentsRacine, { recursive: true, force: true });
    config.documentsRacine = racineOriginale;
    // Garde-fou : si beforeAll a échoué avant d'assigner serviceId, un
    // where: { agent: { serviceId: undefined } } ne filtrerait sur RIEN
    // (Prisma ignore les clés undefined) et supprimerait TOUS les agents
    // et mouvements de la base — déjà arrivé une fois, d'où cette garde.
    if (serviceId) {
      await prisma.document.deleteMany({ where: { agent: { serviceId } } });
      await prisma.mouvement.deleteMany({ where: { agent: { serviceId } } });
      await prisma.agent.deleteMany({ where: { serviceId } });
      await prisma.service.delete({ where: { id: serviceId } });
    }
    await prisma.session.deleteMany({ where: { utilisateurId: { in: [utilisateurSaisieId, utilisateurLectureId, utilisateurAdminId] } } });
    await prisma.journal.deleteMany({ where: { utilisateurId: { in: [utilisateurSaisieId, utilisateurLectureId, utilisateurAdminId] } } });
    await prisma.utilisateur.deleteMany({ where: { id: { in: [utilisateurSaisieId, utilisateurLectureId, utilisateurAdminId] } } });
  });

  beforeEach(async () => {
    limiteurConnexion.reinitialiserTout();
    const agent = await prisma.agent.create({
      data: {
        matricule: `TST-${randomUUID().slice(0, 8)}`,
        nom: "Test",
        prenom: "Agent",
        sexe: "MASCULIN",
        fonction: "Testeur",
        dateRecrutement: new Date("2020-01-01"),
        typeContrat: "CDI",
        serviceId,
      },
    });
    agentId = agent.id;
  });

  afterEach(async () => {
    // Garde-fou : si beforeEach a échoué avant d'assigner agentId, un
    // deleteMany({ where: { agentId: undefined } }) ne filtrerait sur RIEN
    // (Prisma ignore les clés undefined) et supprimerait TOUS les
    // documents de la base — déjà arrivé une fois, d'où cette garde.
    if (!agentId) return;
    await prisma.document.deleteMany({ where: { agentId } });
    await prisma.agent.delete({ where: { id: agentId } });
  });

  it("dépose un PDF valide et le journalise (AJOUT_DOCUMENT)", async () => {
    const cookie = await connecter(identifiantSaisie, motDePasse);
    const res = await posterFichier(
      `/api/agents/${agentId}/documents`,
      { type: "CV" },
      { nom: "cv.pdf", contenu: Buffer.from("%PDF-1.4\n%%EOF"), type: "application/pdf" },
      cookie,
    );
    expect(res.status).toBe(201);
    const corps = await json<CorpsDocument>(res);
    expect(corps.nomOrigine).toBe("cv.pdf");

    const journal = await prisma.journal.findFirst({ where: { action: "AJOUT_DOCUMENT", cibleId: corps.id } });
    expect(journal).not.toBeNull();
  });

  it("refuse un .exe renommé en .pdf (magic bytes), 415", async () => {
    const cookie = await connecter(identifiantSaisie, motDePasse);
    const enteteExe = Buffer.from([0x4d, 0x5a, 0x90, 0x00, 0x03, 0x00, 0x00, 0x00, 0x04, 0x00]);
    const res = await posterFichier(
      `/api/agents/${agentId}/documents`,
      { type: "CV" },
      { nom: "cv.pdf", contenu: enteteExe, type: "application/pdf" },
      cookie,
    );
    expect(res.status).toBe(415);
    expect(await prisma.document.count({ where: { agentId } })).toBe(0);
  });

  it("refuse un PDF de 11 Mo, 413, sans laisser de ligne en base", async () => {
    const cookie = await connecter(identifiantSaisie, motDePasse);
    const gros = Buffer.concat([Buffer.from("%PDF-1.4\n"), Buffer.alloc(11 * 1024 * 1024, 0x41)]);
    const res = await posterFichier(
      `/api/agents/${agentId}/documents`,
      { type: "CV" },
      { nom: "gros.pdf", contenu: gros, type: "application/pdf" },
      cookie,
    );
    expect(res.status).toBe(413);
    expect(await prisma.document.count({ where: { agentId } })).toBe(0);
  }, 30000);

  it("nettoie le fichier écrit si le champ 'type' est invalide (pas de ligne orpheline)", async () => {
    const cookie = await connecter(identifiantSaisie, motDePasse);
    const res = await posterFichier(
      `/api/agents/${agentId}/documents`,
      { type: "TYPE_INEXISTANT" },
      { nom: "cv.pdf", contenu: Buffer.from("%PDF-1.4\n%%EOF"), type: "application/pdf" },
      cookie,
    );
    expect(res.status).toBe(400);
    expect(await prisma.document.count({ where: { agentId } })).toBe(0);

    // Le fichier écrit avant la validation du type ne doit pas rester sur le disque.
    const { readdir } = await import("node:fs/promises");
    async function compterFichiers(dossier: string): Promise<number> {
      const entrees = await readdir(dossier, { withFileTypes: true }).catch(() => []);
      let total = 0;
      for (const entree of entrees) {
        const chemin = path.join(dossier, entree.name);
        total += entree.isDirectory() ? await compterFichiers(chemin) : 1;
      }
      return total;
    }
    expect(await compterFichiers(path.join(config.documentsRacine, String(new Date().getFullYear()), agentId))).toBe(0);
  });

  it("neutralise une tentative de traversée de chemin via le nom de fichier", async () => {
    const cookie = await connecter(identifiantSaisie, motDePasse);
    const res = await posterFichier(
      `/api/agents/${agentId}/documents`,
      { type: "CV" },
      { nom: "../../../../etc/passwd", contenu: Buffer.from("%PDF-1.4\n%%EOF"), type: "application/pdf" },
      cookie,
    );
    expect(res.status).toBe(201);
    const corps = await json<CorpsDocument>(res);
    // Le nom affiché est nettoyé, jamais utilisé comme chemin disque.
    expect(corps.nomOrigine).not.toContain("..");
    expect(corps.nomOrigine).not.toContain("/");

    const document = await prisma.document.findUniqueOrThrow({ where: { id: corps.id } });
    expect(document.cheminFichier).toMatch(new RegExp(`^\\d{4}/${agentId}/[0-9a-f-]+\\.pdf$`));
    // Le fichier est bien resté sous la racine des documents.
    const contenu = await readFile(path.join(config.documentsRacine, document.cheminFichier));
    expect(contenu.toString()).toContain("%PDF");
  });

  it("bloque le dépôt pour un rôle LECTURE (403)", async () => {
    const cookie = await connecter(identifiantLecture, motDePasse);
    const res = await posterFichier(
      `/api/agents/${agentId}/documents`,
      { type: "CV" },
      { nom: "cv.pdf", contenu: Buffer.from("%PDF-1.4\n%%EOF"), type: "application/pdf" },
      cookie,
    );
    expect(res.status).toBe(403);
  });

  it("GET /api/documents/:id/fichier : 401 sans session, sert le fichier avec les bons en-têtes sinon", async () => {
    const cookieSaisie = await connecter(identifiantSaisie, motDePasse);
    const depot = await posterFichier(
      `/api/agents/${agentId}/documents`,
      { type: "CV" },
      { nom: "cv.pdf", contenu: Buffer.from("%PDF-1.4\n%%EOF"), type: "application/pdf" },
      cookieSaisie,
    );
    const { id } = await json<CorpsDocument>(depot);

    const sansCookie = await app.request(`/api/documents/${id}/fichier`);
    expect(sansCookie.status).toBe(401);

    const cookieLecture = await connecter(identifiantLecture, motDePasse);
    const avecCookie = await app.request(`/api/documents/${id}/fichier`, { headers: { Cookie: cookieLecture } });
    expect(avecCookie.status).toBe(200);
    expect(avecCookie.headers.get("content-type")).toBe("application/pdf");
    expect(avecCookie.headers.get("x-content-type-options")).toBe("nosniff");
    expect(avecCookie.headers.get("cache-control")).toBe("private, no-store");

    const journalConsultation = await prisma.journal.findFirst({ where: { action: "CONSULTATION_DOCUMENT", cibleId: id } });
    expect(journalConsultation).not.toBeNull();
  });

  it("dépose un JPEG avec EXIF/GPS et le sert sans métadonnées", async () => {
    const cookieSaisie = await connecter(identifiantSaisie, motDePasse);
    const original = await jpegAvecExif();
    const depot = await posterFichier(
      `/api/agents/${agentId}/documents`,
      { type: "AUTRE" },
      { nom: "photo.jpg", contenu: original, type: "image/jpeg" },
      cookieSaisie,
    );
    expect(depot.status).toBe(201);
    const { id } = await json<CorpsDocument>(depot);

    const cookieLecture = await connecter(identifiantLecture, motDePasse);
    const res = await app.request(`/api/documents/${id}/fichier`, { headers: { Cookie: cookieLecture } });
    const octets = Buffer.from(await res.arrayBuffer());
    const meta = await sharp(octets).metadata();
    expect(meta.exif).toBeUndefined();
  });

  it("DELETE /api/documents/:id : 403 pour un rôle SAISIE, 200 pour ADMIN (déplace en corbeille)", async () => {
    const cookieSaisie = await connecter(identifiantSaisie, motDePasse);
    const depot = await posterFichier(
      `/api/agents/${agentId}/documents`,
      { type: "CV" },
      { nom: "cv.pdf", contenu: Buffer.from("%PDF-1.4\n%%EOF"), type: "application/pdf" },
      cookieSaisie,
    );
    const { id } = await json<CorpsDocument>(depot);

    const refusSaisie = await app.request(`/api/documents/${id}`, { method: "DELETE", headers: { Origin: ORIGINE, Cookie: cookieSaisie } });
    expect(refusSaisie.status).toBe(403);

    const cookieAdmin = await connecter(identifiantAdmin, motDePasse);
    const suppression = await app.request(`/api/documents/${id}`, { method: "DELETE", headers: { Origin: ORIGINE, Cookie: cookieAdmin } });
    expect(suppression.status).toBe(200);

    const document = await prisma.document.findUniqueOrThrow({ where: { id } });
    expect(document.supprimeLe).not.toBeNull();
    expect(document.cheminFichier).toMatch(/^_corbeille\//);
    const contenu = await readFile(path.join(config.documentsRacine, document.cheminFichier));
    expect(contenu.toString()).toContain("%PDF");

    const acces = await app.request(`/api/documents/${id}/fichier`, { headers: { Cookie: cookieAdmin } });
    expect(acces.status).toBe(404);
  });
});
