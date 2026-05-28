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
npm install -g pnpm@11 --quiet
CI=true pnpm install --frozen-lockfile

echo "🔐 Проверка .env..."
if [ ! -f .env ]; then
  echo "❌ Файл .env не найден! Скопируй .env.example и заполни."
  exit 1
fi

echo "🏗️  Сборка образов (с кешем слоёв)..."
# Без --no-cache: изменённый исходник всё равно инвалидирует COPY-слои и
# пересобирается, а неизменные сервисы переиспользуют кеш. Полный --no-cache
# на маленьком VPS перегружает машину (3 параллельные сборки Next.js).
docker compose build

echo "🚀 Перезапуск сервисов..."
# up -d пересоздаёт только изменившиеся контейнеры (минимум простоя),
# дожидается healthy-зависимостей по условиям из compose.
docker compose up -d --remove-orphans

# Миграции БД применяются автоматически при старте API-контейнера
# (apps/api/src/migrations/runner.ts — идемпотентно, в транзакции,
# до начала обслуживания запросов). Отдельный шаг не нужен.

echo "⏳ Ожидание готовности сервисов..."
sleep 10

echo "🏥 Проверка health (через nginx)..."
# Порт api не публикуется на хост — проверяем публичный endpoint через nginx.
curl -sf https://titanpos.ru/api/health && echo "✅ API OK" || echo "❌ API не отвечает"

echo ""
echo "✅ Деплой завершён!"
echo "🌐 https://titanpos.ru"
