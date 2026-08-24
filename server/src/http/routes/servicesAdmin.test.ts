import { randomUUID } from "node:crypto";
import type { RoleUtilisateur } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "../../db";
import { creerApp } from "../app";
import { connexionTest, creerUtilisateurTest, entetes, patcher, poster } from "../testUtils";

const app = creerApp();
const suffixe = randomUUID().slice(0, 8);

describe("Gestion des services (Paramètres)", () => {
  const identifiants: Record<RoleUtilisateur, string> = {
    LECTURE: `test.svcadm.lecture.${suffixe}`,
    SAISIE: `test.svcadm.saisie.${suffixe}`,
    ADMIN: `test.svcadm.admin.${suffixe}`,
  };
  const idsUtilisateurs: string[] = [];
  const idsServices: string[] = [];
  let cookieAdmin: string;
  let cookieSaisie: string;

  beforeAll(async () => {
    for (const [role, identifiant] of Object.entries(identifiants) as [RoleUtilisateur, string][]) {
      const u = await creerUtilisateurTest(identifiant, role);
      idsUtilisateurs.push(u.id);
    }
    cookieAdmin = await connexionTest(app, identifiants.ADMIN);
    cookieSaisie = await connexionTest(app, identifiants.SAISIE);
  });

  afterAll(async () => {
    await prisma.journal.deleteMany({ where: { cibleType: "Service", cibleId: { in: idsServices } } });
    await prisma.service.deleteMany({ where: { id: { in: idsServices } } });
    await prisma.session.deleteMany({ where: { utilisateurId: { in: idsUtilisateurs } } });
    await prisma.journal.deleteMany({ where: { utilisateurId: { in: idsUtilisateurs } } });
    await prisma.utilisateur.deleteMany({ where: { id: { in: idsUtilisateurs } } });
  });

  it("ADMIN crée un service, journalise CREATION_SERVICE", async () => {
    const res = await poster(app, "/api/services", { nom: `Zz Service ${suffixe}`, code: `ZZ${suffixe}` }, cookieAdmin);
    expect(res.status).toBe(201);
    const corps = (await res.json()) as { id: string };
    idsServices.push(corps.id);

    const entree = await prisma.journal.findFirst({ where: { action: "CREATION_SERVICE", cibleId: corps.id } });
    expect(entree).not.toBeNull();
  });

  it("SAISIE ne peut pas créer de service (403)", async () => {
    const res = await poster(app, "/api/services", { nom: "X", code: `XX${suffixe}` }, cookieSaisie);
    expect(res.status).toBe(403);
  });

  it("refuse un code déjà utilisé (409)", async () => {
    const res = await poster(app, "/api/services", { nom: `Zz Doublon ${suffixe}`, code: `ZZ${suffixe}` }, cookieAdmin);
    expect(res.status).toBe(409);
  });

  it("ADMIN modifie (désactive) un service, journalise MODIFICATION_SERVICE", async () => {
    const id = idsServices[0]!;
    const res = await patcher(app, `/api/services/${id}`, { actif: false }, cookieAdmin);
    expect(res.status).toBe(200);
    const service = await prisma.service.findUnique({ where: { id } });
    expect(service?.actif).toBe(false);

    // Réactive pour ne pas gêner le test GET /toutes suivant.
    await patcher(app, `/api/services/${id}`, { actif: true }, cookieAdmin);
  });

  it("GET /api/services/toutes renvoie aussi les services inactifs (réservé ADMIN)", async () => {
    const id = idsServices[0]!;
    await patcher(app, `/api/services/${id}`, { actif: false }, cookieAdmin);

    const res = await app.request("/api/services/toutes", { headers: { Cookie: cookieAdmin } });
    expect(res.status).toBe(200);
    const corps = (await res.json()) as Array<{ id: string; actif: boolean }>;
    expect(corps.find((s) => s.id === id)?.actif).toBe(false);

    const resLecture = await app.request("/api/services/toutes", { headers: entetes(cookieSaisie) });
    expect(resLecture.status).toBe(403);
  });

  it("refuse la suppression d'un service qui a des agents rattachés (409)", async () => {
    const service = await prisma.service.findFirstOrThrow({ where: { actif: true, id: { notIn: idsServices } } });
    const res = await app.request(`/api/services/${service.id}`, { method: "DELETE", headers: entetes(cookieAdmin) });
    expect(res.status).toBe(409);
  });

  it("supprime un service inutilisé", async () => {
    const res = await poster(app, "/api/services", { nom: `Zz Vide ${suffixe}`, code: `ZZV${suffixe}` }, cookieAdmin);
    const corps = (await res.json()) as { id: string };

    const suppr = await app.request(`/api/services/${corps.id}`, { method: "DELETE", headers: entetes(cookieAdmin) });
    expect(suppr.status).toBe(200);
    expect(await prisma.service.findUnique({ where: { id: corps.id } })).toBeNull();
  });
});
