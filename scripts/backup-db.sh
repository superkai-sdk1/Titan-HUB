#!/bin/bash
# ─────────────────────────────────────────────────────────────
# Titan HUB — бэкап Postgres (pg_dump → gzip), ротация 14 дней.
# Запускается: (1) cron ежедневно, (2) deploy.sh ПЕРЕД миграциями.
# ─────────────────────────────────────────────────────────────
set -euo pipefail

REPO_DIR="/opt/titan-hub"
BACKUP_DIR="/opt/backups"
KEEP_DAYS="${BACKUP_KEEP_DAYS:-14}"

cd "$REPO_DIR"
mkdir -p "$BACKUP_DIR"
TS=$(date +%Y%m%d_%H%M%S)
FILE="$BACKUP_DIR/titan_${TS}.sql.gz"

# pg_dump из работающего контейнера postgres (без публикации порта на хост).
docker compose exec -T postgres pg_dump -U titan -d titan_hub | gzip > "$FILE"

# Проверка, что файл не пустой (gzip с данными > ~1KB).
SIZE=$(stat -f%z "$FILE" 2>/dev/null || stat -c%s "$FILE" 2>/dev/null || echo 0)
if [ "$SIZE" -lt 1024 ]; then
  echo "❌ Бэкап подозрительно мал ($SIZE байт) — возможно, БД недоступна: $FILE"
  exit 1
fi

echo "✅ Бэкап: $FILE ($(du -h "$FILE" | cut -f1))"

# Ротация: удаляем бэкапы старше KEEP_DAYS дней.
find "$BACKUP_DIR" -name 'titan_*.sql.gz' -mtime +"$KEEP_DAYS" -delete 2>/dev/null || true
