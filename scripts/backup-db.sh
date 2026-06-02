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

# Локальная ротация: удаляем бэкапы старше KEEP_DAYS дней.
find "$BACKUP_DIR" -name 'titan_*.sql.gz' -mtime +"$KEEP_DAYS" -delete 2>/dev/null || true

# ── Офсайт-копия в Google Drive через rclone (опционально) ────────────────────
# Активируется автоматически, КОГДА на сервере настроен rclone-remote (по умолчанию
# имя "gdrive"): `rclone config` → тип "drive" → одноразовый вход в Google.
# Пока remote не настроен — шаг тихо пропускается (бэкап локально уже сделан).
REMOTE="${BACKUP_RCLONE_REMOTE:-gdrive}"
REMOTE_DIR="${BACKUP_RCLONE_DIR:-titan-backups}"
if command -v rclone >/dev/null 2>&1 && rclone listremotes 2>/dev/null | grep -q "^${REMOTE}:"; then
  if rclone copy "$FILE" "${REMOTE}:${REMOTE_DIR}/" --no-traverse 2>/dev/null; then
    echo "☁️  Выгружено в ${REMOTE}:${REMOTE_DIR}/$(basename "$FILE")"
    # Ротация на Drive: удаляем удалённые копии старше KEEP_DAYS дней.
    rclone delete "${REMOTE}:${REMOTE_DIR}/" --min-age "${KEEP_DAYS}d" 2>/dev/null || true
  else
    echo "⚠️  Не удалось выгрузить бэкап в Google Drive (remote=${REMOTE}) — локальная копия сохранена"
  fi
fi
