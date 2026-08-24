# Image de production pour ZAKA RH (server + web servis par le même
# backend Hono — voir CLAUDE.md, une seule origine, pas de CORS).
#
# Contexte de build attendu : la racine du dépôt (../ depuis ce fichier),
# pas le dossier docker/ — voir `build.context` dans docker-compose.prod.yml.
#
# Basée sur Debian (glibc), pas Alpine : sharp et argon2 embarquent des
# modules natifs dont les binaires précompilés ciblent glibc ; sur Alpine
# (musl) ils retombent souvent sur une compilation locale qui échoue sans
# les bons outils. build-essential/python3 restent installés en filet de
# sécurité si jamais aucun binaire précompilé ne correspond à la plateforme
# de build.

FROM node:20-bookworm-slim AS base
WORKDIR /app
RUN apt-get update \
    && apt-get install -y --no-install-recommends build-essential python3 ca-certificates \
    && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
COPY server/package.json server/package.json
COPY web/package.json web/package.json
RUN npm ci

# ---- Build du frontend (web/dist) ----
FROM base AS build-web
COPY shared ./shared
COPY web ./web
RUN npm run build -w web

# ---- Image runtime ----
FROM base AS runtime
ENV NODE_ENV=production

COPY shared ./shared
COPY server ./server
COPY --from=build-web /app/web/dist ./web/dist
RUN npm run prisma:generate -w server

COPY docker/entrypoint.sh /app/entrypoint.sh
RUN chmod +x /app/entrypoint.sh

EXPOSE 3000

# Pas de curl/wget sur l'image slim : on sonde /api/sante avec le fetch
# natif de Node plutôt que d'ajouter un paquet rien que pour ça.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
    CMD node -e "fetch('http://localhost:3000/api/sante').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

ENTRYPOINT ["/app/entrypoint.sh"]
