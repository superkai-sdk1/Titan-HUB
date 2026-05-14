#!/bin/bash
# ─────────────────────────────────────────────────────────────
# Titan HUB — деплой / обновление на VPS
# Запускать из /opt/titan-hub
# ─────────────────────────────────────────────────────────────
set -euo pipefail

REPO_DIR="/opt/titan-hub"
cd "$REPO_DIR"

echo "🔄 Получение последних изменений..."
git fetch origin main
git reset --hard origin/main

echo "📦 Установка зависимостей..."
npm install -g pnpm
pnpm install --frozen-lockfile

echo "🔐 Проверка .env..."
if [ ! -f .env ]; then
  echo "❌ Файл .env не найден! Скопируй .env.example и заполни."
  exit 1
fi

echo "🏗️  Сборка образов..."
docker compose build --no-cache

echo "🏗️  Запуск базы данных..."
docker compose up -d postgres
sleep 5

echo "🗄️  Применение схемы БД..."
docker compose run --rm \
  -e DATABASE_URL="postgresql://titan:${POSTGRES_PASSWORD:-changeme}@postgres:5432/titan_hub" \
  api sh -c "cd /app && node -e \"require('./dist/migrate.js')\"" 2>/dev/null \
  || (cd /opt/titan-hub && DATABASE_URL="postgresql://titan:${POSTGRES_PASSWORD:-changeme}@localhost:5432/titan_hub" pnpm --filter @titan/database db:push --accept-data-loss) \
  || echo "⚠️  Примените миграции вручную: pnpm --filter @titan/database db:push"

echo "🚀 Перезапуск сервисов..."
docker compose down --remove-orphans
docker compose up -d

echo "⏳ Ожидание готовности сервисов..."
sleep 10

echo "🏥 Проверка health..."
curl -sf http://localhost:3001/health && echo "✅ API OK" || echo "❌ API не отвечает"

echo ""
echo "✅ Деплой завершён!"
echo "🌐 https://titanpos.ru"
