<!-- generated-by: gsd-doc-writer -->
# Деплой и операции — Titan HUB

Продакшн: **https://titanpos.ru** — PWA-кассовая система, работающая на VPS через Docker Compose.

---

## Содержание

1. [Архитектура продакшн-окружения](#архитектура-продакшн-окружения)
2. [Первоначальная настройка сервера](#первоначальная-настройка-сервера)
3. [Процесс деплоя](#процесс-деплоя)
4. [Миграции базы данных](#миграции-базы-данных)
5. [Резервные копии](#резервные-копии)
6. [Точечная пересборка одного сервиса](#точечная-пересборка-одного-сервиса)
7. [Операционные нюансы и известные ловушки](#операционные-нюансы-и-известные-ловушки)
8. [Мониторинг и проверка работоспособности](#мониторинг-и-проверка-работоспособности)
9. [Откат](#откат)

---

## Архитектура продакшн-окружения

### Инфраструктура

| Компонент | Значение |
|-----------|---------|
| Хостинг | VPS <!-- VERIFY: провайдер и характеристики сервера (RAM, CPU) --> |
| Директория проекта | `/opt/titan-hub` |
| Директория бэкапов | `/opt/backups` |
| Домен | `titanpos.ru` |
| TLS-сертификаты | `/opt/titan-hub/nginx/ssl/fullchain.pem` и `privkey.pem` <!-- VERIFY: способ получения и обновления сертификатов (Let's Encrypt / ручной) --> |

### Сервисы Docker Compose

Все сервисы находятся в сети `titan-net` (bridge). Ни один сервис, кроме `nginx`, не публикует порты на хост.

| Сервис | Контейнер | Образ / Dockerfile | Порт внутри сети | Лимит RAM |
|--------|-----------|-------------------|-----------------|-----------|
| `postgres` | `titan-postgres` | `postgres:16-alpine` | 5432 | 768 МБ |
| `redis` | `titan-redis` | `redis:7-alpine` | 6379 | 256 МБ |
| `minio` | `titan-minio` | `minio/minio:RELEASE.2023-06-29T05-12-28Z` | 9000 (API), 9001 (Console) | 512 МБ |
| `api` | `titan-api` | `apps/api/Dockerfile` | 3001 | 768 МБ |
| `web` | `titan-web` | `apps/web/Dockerfile` | 3000 | 768 МБ |
| `wallet` | `titan-wallet` | `apps/wallet/Dockerfile` | 3002 | 512 МБ |
| `bot-admin` | `titan-bot-admin` | `apps/bot-admin/Dockerfile` | — | 256 МБ |
| `bot-wallet` | `titan-bot-wallet` | `apps/bot-wallet/Dockerfile` | — | 256 МБ |
| `nginx` | `titan-nginx` | `nginx:alpine` | 80, 443 (→ хост) | 128 МБ |

### Постоянные тома Docker

| Том | Назначение |
|-----|-----------|
| `postgres-data` | Данные PostgreSQL 16 (`/var/lib/postgresql/data`) |
| `redis-data` | AOF-журнал Redis (`/data`) |
| `minio-data` | Объектное хранилище MinIO (`/data`) |
| `nginx-cache` | Кеш nginx (`/var/cache/nginx`) |
| `/opt/backups` (bind-mount) | Локальные дампы БД, доступны из `api` и хост-скриптов |
| `/root/.config/rclone` (bind-mount, ro) | Конфигурация rclone для выгрузки бэкапов в Google Drive |

### Схема проксирования nginx

nginx слушает порты 80/443 на хосте, редиректит HTTP → HTTPS и проксирует запросы по следующим правилам:

```
titanpos.ru/              → web:3000     (Next.js, HTML no-cache)
titanpos.ru/api/          → api:3001     (rate limit 30 r/s, burst 50)
titanpos.ru/api/auth/login → api:3001    (жёсткий rate limit 5 r/min, burst 10)
titanpos.ru/api/system/update → api:3001 (SSE, no-buffering, timeout 600s)
titanpos.ru/media/        → minio:9000   (runtime-resolver, бакет titan-hub, кеш 30d)
titanpos.ru/wallet/       → wallet:3002  (^~ приоритет над regex, basePath /wallet)
titanpos.ru/wallet         → wallet:3002 (точный match)
/_next/static/            → web:3000     (immutable cache)
/wallet/_next/static/     → wallet:3002  (immutable cache)
```

Конфигурация nginx: `nginx/nginx.conf` (bind-mount `ro` в контейнер).

**Важно про MinIO:** location `/media/` использует `resolver 127.0.0.11` (Docker DNS) с `set $minio_upstream minio:9000` — nginx резолвит upstream в рантайме, а не при старте. Это предотвращает полный 502 при падении/отсутствии контейнера minio (ошибка будет только на `/media/`, остальное работает).

### Порядок запуска контейнеров

`docker compose` соблюдает `depends_on` с условиями:

```
postgres (healthy) ──┬──→ api (healthy) ──→ nginx
redis    (healthy) ──┘
                      ──→ bot-admin
                      ──→ bot-wallet
web      (healthy) ──────→ nginx
wallet   (healthy) ──────→ nginx
```

nginx стартует только после того, как `api`, `web` и `wallet` прошли healthcheck — это закрывает окно 502 при холодном старте и перезагрузке хоста.

---

## Первоначальная настройка сервера

Выполняется один раз при развёртывании на новом VPS.

```bash
# 1. Клонировать репозиторий
git clone <REPO_URL> /opt/titan-hub   # <!-- VERIFY: URL репозитория -->
cd /opt/titan-hub

# 2. Создать .env на основе примера и заполнить все переменные
cp .env.example .env
nano .env

# 3. Разместить TLS-сертификаты
mkdir -p nginx/ssl
# Скопировать fullchain.pem и privkey.pem в nginx/ssl/
# <!-- VERIFY: способ получения сертификатов (certbot, ручной) -->

# 4. Создать директорию для бэкапов
mkdir -p /opt/backups

# 5. Первый запуск
docker compose build
docker compose up -d

# 6. Настроить cron для ежедневных бэкапов (см. раздел «Резервные копии»)
```

---

## Процесс деплоя

### Стандартный деплой

Деплой выполняется на сервере из директории `/opt/titan-hub`:

```bash
cd /opt/titan-hub && bash scripts/deploy.sh
```

### Запуск detached (рекомендуется)

SSH-соединение может разорваться во время сборки Docker-образов (особенно при одновременной сборке трёх Next.js-приложений). Запускайте деплой в фоне:

```bash
nohup bash /opt/titan-hub/scripts/deploy.sh > /opt/titan-hub/deploy.log 2>&1 &
# Следить за прогрессом:
tail -f /opt/titan-hub/deploy.log
```

### Что делает `scripts/deploy.sh` — пошагово

```
1. git fetch origin main
   git reset --hard origin/main
   → Жёсткий сброс к HEAD origin/main. Любые локальные изменения на сервере
     уничтожаются. Коммиты публикуются через push на origin/main.

2. npm install -g pnpm@11 --quiet
   CI=true pnpm install --frozen-lockfile
   → Устанавливает/обновляет pnpm, затем устанавливает зависимости монорепо
     строго по pnpm-lock.yaml (CI=true — без интерактивных промптов).

3. Проверка наличия .env
   → Деплой прерывается с ошибкой, если .env отсутствует.

4. docker compose build
   → Пересобирает изменённые образы с использованием кеша слоёв Docker.
     Неизменные сервисы переиспользуют кеш — полная сборка всех трёх Next.js
     одновременно без --no-cache снижает нагрузку на маленький VPS.

5. bash scripts/backup-db.sh
   → Делает pg_dump ПЕРЕД применением миграций (они запустятся на шаге 6).
     При неудаче бэкапа деплой НЕ прерывается — выводится предупреждение
     (например, при первом запуске postgres ещё не существует).

6. docker compose up -d --remove-orphans
   → Пересоздаёт только изменившиеся контейнеры (минимум простоя).
     При старте api-контейнера автоматически запускается runner миграций
     (apps/api/src/migrations/runner.ts) — см. раздел «Миграции».
     --remove-orphans удаляет контейнеры от удалённых из compose сервисов.

7. sleep 10
   → Пауза для завершения старта сервисов и healthcheck-прогрева.

8. docker exec titan-nginx nginx -s reload
   (fallback: docker compose restart nginx)
   → После up -d пересозданные контейнеры (api/web/wallet) получают новые
     IP-адреса в Docker-сети. nginx кеширует upstream-IP, поэтому без reload
     он продолжает обращаться к старому (уже не существующему) адресу.
     nginx -s reload — zero-downtime (без разрыва текущих соединений).

9. curl -sf https://titanpos.ru/api/health
   → Финальная проверка через публичный эндпоинт (через nginx).
     Порт api (3001) не публикуется на хост напрямую.
```

---

## Миграции базы данных

### Механизм

Миграции применяются **автоматически при старте `api`-контейнера** — отдельный шаг деплоя не нужен.

Точка входа: `apps/api/src/migrations/runner.ts`

Алгоритм:
1. Создаёт таблицу `_migrations (id text PRIMARY KEY, applied_at timestamptz)`, если её нет.
2. Читает все `.sql`-файлы из `apps/api/src/migrations/sql/` в алфавитном (числовом) порядке.
3. Сверяет список файлов с записями в `_migrations` — пропускает уже применённые.
4. Каждую новую миграцию применяет в транзакции: сначала выполняет SQL, затем вставляет запись в `_migrations`. При ошибке — откат транзакции, сервер падает (деплой видит unhealthy контейнер).

### Именование файлов

```
apps/api/src/migrations/sql/
  001_init.sql
  ...
  044_stock_ledger.sql
  045_tx_idempotency.sql
  046_drafts.sql          ← текущая последняя
```

Формат имени: `NNN_description.sql` (трёхзначный номер + описание). Порядок применения — алфавитный, что совпадает с числовым.

### Безопасность миграций

- Бэкап БД делается **до** `docker compose up -d` (шаг 5 deploy.sh).
- Каждая миграция атомарна: либо применена полностью, либо откатилась.
- Раннер идемпотентен: повторный запуск api на той же БД ничего не делает.
- Если миграция упала — api-контейнер не переходит в `healthy`, nginx не получает трафик до восстановления.

### Добавление новой миграции

```bash
# Создать файл с следующим номером в последовательности
touch apps/api/src/migrations/sql/047_my_change.sql
# Написать идемпотентный SQL (IF NOT EXISTS, IF EXISTS, ADD COLUMN IF NOT EXISTS и т.д.)
# Закоммитить и запушить — раннер применит при следующем деплое
```

---

## Резервные копии

### Скрипт `scripts/backup-db.sh`

```bash
bash /opt/titan-hub/scripts/backup-db.sh
```

**Что делает:**

1. Создаёт `/opt/backups/` если не существует.
2. Запускает `pg_dump` через `docker compose exec -T postgres` — без публикации порта postgres на хост.
3. Сохраняет дамп в `/opt/backups/titan_YYYYMMDD_HHMMSS.sql.gz` (gzip-сжатие).
4. Флаги дампа: `--clean --if-exists --no-owner --no-privileges` — дамп можно восстановить поверх существующей БД (DROP+CREATE таблиц).
5. Проверяет, что файл больше 1024 байт (защита от пустого дампа при недоступной БД).
6. Удаляет дампы старше `BACKUP_KEEP_DAYS` дней (по умолчанию: `14`).
7. **Офсайт-копия в Google Drive через rclone** — активируется автоматически при наличии настроенного remote `gdrive`. Если rclone не настроен — шаг тихо пропускается.

### Переменные окружения

| Переменная | Значение по умолчанию | Описание |
|------------|----------------------|----------|
| `BACKUP_KEEP_DAYS` | `14` | Сколько дней хранить локальные дампы |
| `BACKUP_RCLONE_REMOTE` | `gdrive` | Имя rclone-remote для офсайт-копии |
| `BACKUP_RCLONE_DIR` | `titan-backups` | Директория в remote |

### Настройка cron (ежедневный бэкап)

```bash
crontab -e
# Добавить строку (бэкап каждый день в 03:00 по времени сервера):
0 3 * * * cd /opt/titan-hub && bash scripts/backup-db.sh >> /var/log/titan-backup.log 2>&1
```

### Настройка rclone для Google Drive (опционально)

```bash
# На сервере:
rclone config
# → New remote → name: gdrive → type: drive → следовать инструкциям OAuth
# После настройки бэкапы будут автоматически выгружаться в Google Drive
```

### Восстановление из бэкапа

```bash
# 1. Остановить api (чтобы не было активных подключений к БД)
docker compose stop api

# 2. Распаковать и восстановить дамп
gunzip -c /opt/backups/titan_20260612_030000.sql.gz | \
  docker compose exec -T postgres psql -U titan -d titan_hub

# 3. Запустить api обратно
docker compose start api

# 4. Перезагрузить nginx
docker exec titan-nginx nginx -s reload
```

Восстановление также доступно через кнопку «О системе → Восстановить» в интерфейсе (API вызывает `psql` изнутри контейнера `api`, который имеет доступ к `/backups`).

---

## Точечная пересборка одного сервиса

Если изменился только один сервис (например, только фронтенд), нет смысла пересобирать всё:

```bash
cd /opt/titan-hub

# Пример: пересборка только web
docker compose build web
docker compose up -d web

# После up -d web контейнер получает новый IP — перезагрузить nginx
docker exec titan-nginx nginx -s reload

# Проверка
curl -sf https://titanpos.ru/api/health && echo "OK"
```

Аналогично для других сервисов: `api`, `wallet`, `bot-admin`, `bot-wallet`.

---

## Операционные нюансы и известные ловушки

### 1. SSH рвётся под нагрузкой сборки

Одновременная сборка трёх Next.js-приложений (`web`, `wallet`, плюс `api`) сильно нагружает CPU/RAM VPS. SSH-соединение может разорваться до завершения деплоя.

**Решение:** запускать деплой detached через `nohup` (см. [«Запуск detached»](#запуск-detached-рекомендуется)).

### 2. Гонка nginx-reload → кратковременное «API не отвечает»

После `docker compose up -d` контейнеры пересоздаются с новыми IP в сети `titan-net`. nginx кеширует IP upstream при старте. Если до reload nginx успевает получить запросы — они уходят на несуществующий IP → 502.

**Поведение:** `deploy.sh` делает `sleep 10` перед `nginx -s reload`, чтобы дать сервисам время стартовать. Кратковременное 502 возможно в окне между `up -d` и `reload`. При нормальном деплое это окно < 15 секунд.

**nginx -s reload** не разрывает активные соединения (zero-downtime), в отличие от `restart`.

### 3. Порт API не публикуется на хост

Порт `3001` (api) намеренно не прописан в `ports:` в `docker-compose.yml`. Прямой доступ к API снаружи Docker-сети невозможен. Healthcheck в `deploy.sh` проверяет публичный эндпоинт через nginx:

```bash
curl -sf https://titanpos.ru/api/health
```

Проверить API напрямую из хоста нельзя без `docker exec` или входа в сеть контейнеров.

### 4. Падение MinIO не роняет весь сайт

Nginx использует runtime-resolver для upstream minio (`resolver 127.0.0.11`). При недоступности minio получает 502 только location `/media/`. Остальные части приложения продолжают работать. Без этого паттерна отсутствие minio при старте или reload nginx приводило бы к полному 502 (инцидент 2026-05-30).

### 5. SW (Service Worker) и PWA

При обновлении фронтенда необходимо увеличивать версию Service Worker — иначе браузер продолжает использовать кешированную версию.

Файл: `apps/web/public/sw.js`, переменная `CACHE_VERSION`.

```bash
# Найти текущую версию:
grep CACHE_VERSION apps/web/public/sw.js
# Увеличить вручную перед коммитом фронтенд-изменений
```

### 6. Диск заполнен — чистка кеша сборки Docker

```bash
# Показать использование диска Docker:
docker system df

# Очистить только кеш сборщика (BuildKit) — данные томов НЕ затрагиваются:
docker builder prune -af

# НЕ использовать docker system prune -a --volumes — удалит postgres-data, minio-data!
```

**Безопасная чистка** (кеш сборки + остановленные контейнеры + неиспользуемые образы, без томов):

```bash
docker system prune -af  # без --volumes — данные целы
```

### 7. Redis с AOF-журналом

Redis запущен с `--appendonly yes` — переживает перезагрузку хоста без потери состояния (rate-limit зоны, blacklist токенов). При `docker compose restart redis` состояние восстанавливается из AOF.

---

## Мониторинг и проверка работоспособности

### Health-эндпоинт

```bash
# Публичный (через nginx):
curl -sf https://titanpos.ru/api/health

# Из docker-сети (например, изнутри другого контейнера):
curl http://api:3001/health
```

### Статус контейнеров

```bash
cd /opt/titan-hub
docker compose ps
```

### Логи

```bash
# Все сервисы (последние 100 строк):
docker compose logs --tail=100

# Конкретный сервис:
docker compose logs -f api
docker compose logs -f nginx
docker compose logs -f postgres

# Лог деплоя (если запускали через nohup):
tail -f /opt/titan-hub/deploy.log
```

### Rate limiting

nginx настроен с двумя зонами:

| Зона | Эндпоинт | Лимит | Burst |
|------|----------|-------|-------|
| `api` | `/api/` | 30 запросов/сек | 50 |
| `auth` | `/api/auth/login` | 5 запросов/мин | 10 |

При превышении лимита nginx возвращает `429 Too Many Requests`.

### HTTP-заголовки безопасности

nginx добавляет:
- `Strict-Transport-Security: max-age=31536000; includeSubDomains`
- `X-Frame-Options: DENY`
- `X-Content-Type-Options: nosniff`

---

## Откат

### Быстрый откат к предыдущему коммиту

```bash
cd /opt/titan-hub

# Посмотреть последние коммиты:
git log --oneline -10

# Откатиться к конкретному коммиту (замените SHA):
git checkout <COMMIT_SHA>

# Пересобрать и перезапустить:
docker compose build
docker compose up -d --remove-orphans
docker exec titan-nginx nginx -s reload
```

**Внимание:** если откат затрагивает коммиты с новыми миграциями, раннер при старте НЕ откатит уже применённые миграции — нужно восстановить БД из бэкапа вручную (см. [«Восстановление из бэкапа»](#восстановление-из-бэкапа)).

### Откат после неудачной миграции

1. Остановить `api` (`docker compose stop api`).
2. Восстановить БД из бэкапа, сделанного перед деплоем (`/opt/backups/titan_*.sql.gz`).
3. Исправить SQL-файл миграции, закоммитить, запушить.
4. Запустить деплой: `bash scripts/deploy.sh`.

### Восстановление после полного сбоя

<!-- VERIFY: процедура восстановления на новом сервере (IP, DNS-запись titanpos.ru) -->

Общий порядок:
1. Развернуть новый VPS, клонировать репозиторий в `/opt/titan-hub`.
2. Скопировать `.env` с секретами.
3. Разместить TLS-сертификаты в `nginx/ssl/`.
4. Скопировать последний дамп БД в `/opt/backups/`.
5. Запустить `docker compose up -d`.
6. После старта восстановить БД из дампа (см. выше).
7. Обновить DNS-запись домена на новый IP сервера.
