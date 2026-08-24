import { describe, expect, it } from "vitest";
import { creerApp } from "./app";

describe("GET /api/sante", () => {
  it("répond 200 sans authentification", async () => {
    const app = creerApp();
    const res = await app.request("/api/sante");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });
});
