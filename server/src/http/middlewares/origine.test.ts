import { Hono } from "hono";
import { describe, expect, it } from "vitest";
import { verifierOrigine } from "./origine";

const ORIGINE_ATTENDUE = "http://localhost:5173";

function creerAppTest() {
  const app = new Hono();
  app.use("*", verifierOrigine(ORIGINE_ATTENDUE));
  app.get("/test", (c) => c.json({ ok: true }));
  app.post("/test", (c) => c.json({ ok: true }));
  return app;
}

describe("verifierOrigine", () => {
  it("laisse passer un GET sans en-tête Origin", async () => {
    const app = creerAppTest();
    const res = await app.request("/test", { method: "GET" });
    expect(res.status).toBe(200);
  });

  it("laisse passer un POST avec la bonne Origin", async () => {
    const app = creerAppTest();
    const res = await app.request("/test", { method: "POST", headers: { Origin: ORIGINE_ATTENDUE } });
    expect(res.status).toBe(200);
  });

  it("rejette un POST avec une Origin étrangère", async () => {
    const app = creerAppTest();
    const res = await app.request("/test", { method: "POST", headers: { Origin: "https://malveillant.example" } });
    expect(res.status).toBe(403);
  });

  it("rejette un POST sans en-tête Origin du tout", async () => {
    const app = creerAppTest();
    const res = await app.request("/test", { method: "POST" });
    expect(res.status).toBe(403);
  });
});
