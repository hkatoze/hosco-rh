# scripts

Sauvegarde et restauration de la base PostgreSQL **et** du répertoire des
documents (les documents sont sur disque, jamais en base — voir
CLAUDE.md). Agissent sur le stack `docker-compose.prod.yml` déjà démarré.

```bash
scripts/sauvegarder.sh                    # crée sauvegardes/AAAA-MM-JJ_HHMMSS/
scripts/restaurer.sh                      # restaure la plus récente
scripts/restaurer.sh sauvegardes/2026-08-21_020000  # restaure une sauvegarde précise
```

`restaurer.sh` remplace entièrement la base et les documents actuels —
confirmation manuelle requise (taper `RESTAURER`).

Réglages via variables d'environnement (voir l'en-tête de chaque script) :
`FICHIER_ENV`, `REPERTOIRE_SAUVEGARDES`, `RETENTION_JOURS`.

Pour une sauvegarde automatique, planifier `scripts/sauvegarder.sh` en cron
sur le serveur (ex. tous les jours à 2h).
