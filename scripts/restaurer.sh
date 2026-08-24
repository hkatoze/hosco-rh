#!/bin/sh
set -eu

# Restauration à partir d'une sauvegarde produite par sauvegarder.sh.
# ATTENTION : remplace entièrement la base de données ET les documents
# actuels par ceux de la sauvegarde. Opération destructive, confirmation
# manuelle requise.
#
# Usage :
#   scripts/restaurer.sh [répertoire-de-sauvegarde]
# Sans argument, utilise la sauvegarde la plus récente trouvée dans
# REPERTOIRE_SAUVEGARDES (défaut : ./sauvegardes).

REPERTOIRE_SCRIPT="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
REPERTOIRE_RACINE="$(cd -- "$REPERTOIRE_SCRIPT/.." && pwd)"
REPERTOIRE_DOCKER="$REPERTOIRE_RACINE/docker"
FICHIER_COMPOSE="$REPERTOIRE_DOCKER/docker-compose.prod.yml"
FICHIER_ENV="${FICHIER_ENV:-$REPERTOIRE_DOCKER/.env.prod}"
REPERTOIRE_SAUVEGARDES="${REPERTOIRE_SAUVEGARDES:-$REPERTOIRE_RACINE/sauvegardes}"

SOURCE="${1:-}"
if [ -z "$SOURCE" ]; then
  SOURCE="$(find "$REPERTOIRE_SAUVEGARDES" -mindepth 1 -maxdepth 1 -type d 2>/dev/null | sort | tail -n 1)"
  if [ -n "$SOURCE" ]; then
    echo "Aucune sauvegarde précisée, utilisation de la plus récente : $SOURCE"
  fi
fi
if [ -z "$SOURCE" ] || [ ! -d "$SOURCE" ]; then
  echo "Usage : $0 [répertoire-de-sauvegarde]" >&2
  echo "Aucune sauvegarde valide trouvée dans $REPERTOIRE_SAUVEGARDES." >&2
  exit 1
fi
if [ ! -f "$SOURCE/base.dump" ] || [ ! -f "$SOURCE/documents.tar.gz" ]; then
  echo "Sauvegarde incomplète dans $SOURCE (base.dump ou documents.tar.gz manquant)." >&2
  exit 1
fi

if [ ! -f "$FICHIER_ENV" ]; then
  echo "Fichier d'environnement introuvable : $FICHIER_ENV" >&2
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

echo "⚠️  Cette opération remplace la base de données et tous les documents actuels."
echo "    Source : $SOURCE"
printf "Confirmer en tapant RESTAURER : "
read -r CONFIRMATION
if [ "$CONFIRMATION" != "RESTAURER" ]; then
  echo "Annulé."
  exit 1
fi

echo "→ Arrêt de l'application..."
compose stop app

echo "→ Restauration de la base PostgreSQL (pg_restore --clean)..."
compose exec -T postgres pg_restore -U "${POSTGRES_USER:-hosco}" -d "${POSTGRES_DB:-hosco_personnel}" \
  --clean --if-exists --no-owner --single-transaction < "$SOURCE/base.dump"

echo "→ Restauration des documents..."
compose run --rm -T --no-deps --entrypoint sh app -c \
  "rm -rf /donnees/documents/* /donnees/documents/.[!.]* 2>/dev/null; tar xzf - -C /donnees/documents" < "$SOURCE/documents.tar.gz"

echo "→ Redémarrage de l'application (applique les migrations si besoin)..."
compose up -d app

echo "Restauration terminée depuis : $SOURCE"
