import "dotenv/config";
import { serve } from "@hono/node-server";
import { config } from "./config";
import { creerApp } from "./http/app";
import { demarrerNettoyagePeriodique } from "./tasks/nettoyage";

const app = creerApp();

serve({ fetch: app.fetch, port: config.port }, (info) => {
  console.log(`HOSCO Personnel — serveur démarré sur le port ${info.port}`);
});

demarrerNettoyagePeriodique();
