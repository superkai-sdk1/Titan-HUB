#!/bin/bash
# Обновление SSL сертификатов (добавить в cron: 0 3 * * * bash /opt/titan-hub/scripts/renew-ssl.sh)
set -euo pipefail
certbot renew --quiet
cp /etc/letsencrypt/live/titanpos.ru/fullchain.pem /opt/titan-hub/nginx/ssl/
cp /etc/letsencrypt/live/titanpos.ru/privkey.pem /opt/titan-hub/nginx/ssl/
docker compose -f /opt/titan-hub/docker-compose.yml restart nginx
echo "✅ SSL обновлён"
