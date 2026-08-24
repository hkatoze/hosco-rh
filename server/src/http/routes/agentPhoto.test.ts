import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type { RoleUtilisateur } from "@prisma/client";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { config } from "../../config";
import { prisma } from "../../db";
import { creerApp } from "../app";
import { connexionTest, creerUtilisateurTest, ORIGINE_TEST } from "../testUtils";

const app = creerApp();
const suffixe = randomUUID().slice(0, 8);

// 1x1 PNG rouge, valide (octets d'en-tête PNG réels).
const PNG_1X1 = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
  "base64",
);

describe("GET /api/agents/:id/photo", () => {
  const identifiants: Record<RoleUtilisateur, string> = {
    LECTURE: `test.photo.lecture.${suffixe}`,
    SAISIE: `test.photo.saisie.${suffixe}`,
    ADMIN: `test.photo.admin.${suffixe}`,
  };
  const idsUtilisateurs: string[] = [];
  let serviceId: string;
  let cookieLecture: string;
  let cookieSaisie: string;
  let agentId: string;
  let racineOriginale: string;

  beforeAll(async () => {
    // Racine temporaire dédiée (voir documents.test.ts) : évite toute
    // interférence avec les autres suites qui touchent aussi le disque en
    // parallèle.
    racineOriginale = config.documentsRacine;
    config.documentsRacine = await mkdtemp(path.join(tmpdir(), "hosco-photo-http-"));

    for (const [role, identifiant] of Object.entries(identifiants) as [RoleUtilisateur, string][]) {
      const u = await creerUtilisateurTest(identifiant, role);
      idsUtilisateurs.push(u.id);
    }
    const service = await prisma.service.findFirstOrThrow({ where: { actif: true } });
    serviceId = service.id;
    cookieLecture = await connexionTest(app, identifiants.LECTURE);
    cookieSaisie = await connexionTest(app, identifiants.SAISIE);
  });

  afterAll(async () => {
    await rm(config.documentsRacine, { recursive: true, force: true });
    config.documentsRacine = racineOriginale;
    await prisma.session.deleteMany({ where: { utilisateurId: { in: idsUtilisateurs } } });
    await prisma.journal.deleteMany({ where: { utilisateurId: { in: idsUtilisateurs } } });
    await prisma.utilisateur.deleteMany({ where: { id: { in: idsUtilisateurs } } });
  });

  beforeEach(async () => {
    const agent = await prisma.agent.create({
      data: {
        matricule: `ZZPHOTO-${suffixe}-${randomUUID().slice(0, 6)}`,
        nom: "ZzTestPhoto",
        prenom: "Fixture",
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
    await prisma.journal.deleteMany({ where: { cibleType: "Agent", cibleId: agentId } });
    await prisma.agent.delete({ where: { id: agentId } });
  });

  it("404 si l'agent n'a pas de photo", async () => {
    const res = await app.request(`/api/agents/${agentId}/photo`, { headers: { Cookie: cookieLecture } });
    expect(res.status).toBe(404);
  });

  it("401 sans session", async () => {
    const res = await app.request(`/api/agents/${agentId}/photo`);
    expect(res.status).toBe(401);
  });

  it("sert la photo déposée avec le bon Content-Type", async () => {
    const formulaire = new FormData();
    formulaire.append("fichier", new Blob([PNG_1X1], { type: "image/png" }), "photo.png");
    const upload = await app.request(`/api/agents/${agentId}/photo`, {
      method: "PUT",
      headers: { Origin: ORIGINE_TEST, Cookie: cookieSaisie },
      body: formulaire,
    });
    expect(upload.status).toBe(200);

    const res = await app.request(`/api/agents/${agentId}/photo`, { headers: { Cookie: cookieLecture } });
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("image/jpeg");
  });
});
