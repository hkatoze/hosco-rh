#!/bin/sh
set -eu

# Sauvegarde de la base PostgreSQL ET du répertoire des documents.
# Les documents sont stockés sur disque, jamais en base (voir CLAUDE.md) :
# une sauvegarde de la seule base ne suffirait pas à restaurer
# l'application.
#
# Usage :
#   scripts/sauvegarder.sh
# Variables d'environnement optionnelles :
#   FICHIER_ENV           chemin vers .env.prod (défaut : docker/.env.prod)
#   REPERTOIRE_SAUVEGARDES répertoire de sortie  (défaut : ./sauvegardes)
#   RETENTION_JOURS        purge des sauvegardes plus anciennes (défaut : 30, 0 = désactivé)

REPERTOIRE_SCRIPT="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
REPERTOIRE_RACINE="$(cd -- "$REPERTOIRE_SCRIPT/.." && pwd)"
REPERTOIRE_DOCKER="$REPERTOIRE_RACINE/docker"
FICHIER_COMPOSE="$REPERTOIRE_DOCKER/docker-compose.prod.yml"
FICHIER_ENV="${FICHIER_ENV:-$REPERTOIRE_DOCKER/.env.prod}"
REPERTOIRE_SAUVEGARDES="${REPERTOIRE_SAUVEGARDES:-$REPERTOIRE_RACINE/sauvegardes}"
RETENTION_JOURS="${RETENTION_JOURS:-30}"

if [ ! -f "$FICHIER_ENV" ]; then
  echo "Fichier d'environnement introuvable : $FICHIER_ENV" >&2
  echo "Copier docker/.env.prod.example vers docker/.env.prod et le compléter." >&2
  exit 1
fi
set -a
. "$FICHIER_ENV"
set +a

# Fonction plutôt que variable-commande : une chaîne réinterpolée par le
# shell casse dès que le chemin du dépôt contient un espace (fréquent sous
# Windows/OneDrive) — voir le mot-clé "word splitting".
compose() {
  docker compose -f "$FICHIER_COMPOSE" --env-file "$FICHIER_ENV" "$@"
}

if ! compose exec -T postgres pg_isready -U "${POSTGRES_USER:-hosco}" -d "${POSTGRES_DB:-hosco_personnel}" >/dev/null 2>&1; then
  echo "PostgreSQL n'est pas accessible. Le stack de production est-il démarré ?" >&2
  echo "  docker compose -f \"$FICHIER_COMPOSE\" --env-file \"$FICHIER_ENV\" up -d" >&2
  exit 1
fi

HORODATAGE="$(date +%Y-%m-%d_%H%M%S)"
CIBLE="$REPERTOIRE_SAUVEGARDES/$HORODATAGE"
mkdir -p "$CIBLE"

echo "→ Base PostgreSQL..."
compose exec -T postgres pg_dump -U "${POSTGRES_USER:-hosco}" -d "${POSTGRES_DB:-hosco_personnel}" -F c > "$CIBLE/base.dump"

echo "→ Documents..."
compose exec -T app tar czf - -C /donnees/documents . > "$CIBLE/documents.tar.gz"

echo "$HORODATAGE" > "$CIBLE/horodatage.txt"

if [ "$RETENTION_JOURS" -gt 0 ]; then
  echo "→ Purge des sauvegardes de plus de $RETENTION_JOURS jours..."
  find "$REPERTOIRE_SAUVEGARDES" -mindepth 1 -maxdepth 1 -type d -mtime +"$RETENTION_JOURS" -print -exec rm -rf {} \;
fi

echo "Sauvegarde terminée : $CIBLE"
du -sh "$CIBLE"/base.dump "$CIBLE"/documents.tar.gz 2>/dev/null || true
