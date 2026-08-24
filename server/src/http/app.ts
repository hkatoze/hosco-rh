import { serveStatic } from "@hono/node-server/serve-static";
import { Hono } from "hono";
import { config } from "../config";
import type { VariablesHono } from "./context";
import { verifierOrigine } from "./middlewares/origine";
import { routesAgents } from "./routes/agents";
import { routesAgentPhoto } from "./routes/agentPhoto";
import { routesAnomalies } from "./routes/anomalies";
import { routesAuth } from "./routes/auth";
import { routesCorbeille } from "./routes/corbeille";
import { routesDocuments, routesDocumentsAgent } from "./routes/documents";
import { routesMouvements } from "./routes/mouvements";
import { routesServices } from "./routes/services";
import { routesTableauDeBord } from "./routes/tableauDeBord";
import { routesUtilisateurs } from "./routes/utilisateurs";

export function creerApp() {
  const app = new Hono<{ Variables: VariablesHono }>();

  app.use("*", verifierOrigine(config.origineAttendue));

  // Sans authentification, à dessein : sondée par le HEALTHCHECK Docker et
  // par Caddy, avant même qu'une session puisse exister.
  app.get("/api/sante", (c) => c.json({ ok: true }));

  app.route("/api/auth", routesAuth);
  app.route("/api/utilisateurs", routesUtilisateurs);
  app.route("/api/services", routesServices);
  app.route("/api/agents", routesAgents);
  app.route("/api/agents", routesDocumentsAgent);
  app.route("/api/agents", routesAgentPhoto);
  app.route("/api/documents", routesDocuments);
  app.route("/api/mouvements", routesMouvements);
  app.route("/api/corbeille", routesCorbeille);
  app.route("/api/tableau-de-bord", routesTableauDeBord);
  app.route("/api/anomalies", routesAnomalies);

  // Même origine, pas de CORS : le build du front (web/dist) est servi par
  // ce même backend. En dev, on utilise plutôt `npm run dev` dans web/ (Vite
  // + proxy /api) ; ce bloc ne sert qu'en usage "build" (preview/production).
  app.use("*", serveStatic({ root: "../web/dist" }));
  app.get("*", serveStatic({ root: "../web/dist", path: "index.html" }));

  return app;
}
