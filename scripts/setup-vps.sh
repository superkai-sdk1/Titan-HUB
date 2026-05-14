#!/bin/bash
# ─────────────────────────────────────────────────────────────
# Titan HUB — первоначальная настройка VPS (titanpos.ru)
# Запускать один раз от root
# ─────────────────────────────────────────────────────────────
set -euo pipefail

echo "🔧 Обновление системы..."
apt-get update && apt-get upgrade -y

echo "📦 Установка зависимостей..."
apt-get install -y curl git nginx certbot python3-certbot-nginx ufw

echo "🐳 Установка Docker..."
curl -fsSL https://get.docker.com | sh
systemctl enable docker
systemctl start docker

echo "🔒 Настройка файрвола..."
ufw allow OpenSSH
ufw allow 80/tcp
ufw allow 443/tcp
ufw --force enable

echo "📁 Создание директории приложения..."
mkdir -p /opt/titan-hub
cd /opt/titan-hub

echo "🔐 Получение SSL-сертификата..."
certbot --nginx -d titanpos.ru -d www.titanpos.ru --non-interactive --agree-tos -m admin@titanpos.ru

echo "📂 Копирование SSL сертификатов в nginx/ssl..."
mkdir -p /opt/titan-hub/nginx/ssl
cp /etc/letsencrypt/live/titanpos.ru/fullchain.pem /opt/titan-hub/nginx/ssl/
cp /etc/letsencrypt/live/titanpos.ru/privkey.pem /opt/titan-hub/nginx/ssl/

echo "✅ VPS готов! Теперь клонируй репозиторий:"
echo "   git clone https://github.com/superkai-sdk1/Titan-HUB.git /opt/titan-hub"
echo "   cd /opt/titan-hub"
echo "   cp .env.example .env && nano .env"
echo "   bash scripts/deploy.sh"
