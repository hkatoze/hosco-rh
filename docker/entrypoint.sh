#!/bin/sh
set -eu

# Le cwd doit être server/ : app.ts sert le front avec un chemin relatif
# ("../web/dist", résolu par rapport au process.cwd() de serveStatic) — voir
# server/src/http/app.ts. C'est la même contrainte qu'en test manuel local.
cd /app/server

echo "Application des migrations Prisma (migrate deploy)..."
npx prisma migrate deploy

echo "Démarrage du serveur..."
exec node --import tsx src/server.ts
