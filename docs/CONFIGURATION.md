<!-- generated-by: gsd-doc-writer -->
# Конфигурация Titan HUB

Полный справочник по переменным окружения, конфигурационным файлам, рантайм-настройкам в БД и Service Worker.

---

## Содержание

1. [Переменные окружения](#1-переменные-окружения)
   - [Обязательные (все сервисы)](#11-обязательные-все-сервисы)
   - [API (`apps/api`)](#12-api-appsapi)
   - [Web-фронтенд (`apps/web`)](#13-web-фронтенд-appsweb)
   - [Wallet (`apps/wallet`)](#14-wallet-appswallet)
   - [Bot-Admin (`apps/bot-admin`)](#15-bot-admin-appsbot-admin)
   - [Bot-Wallet (`apps/bot-wallet`)](#16-bot-wallet-appsbot-wallet)
2. [Конфигурационные файлы](#2-конфигурационные-файлы)
   - [docker-compose.yml](#21-docker-composeyml)
   - [nginx/nginx.conf](#22-nginxnginxconf)
   - [turbo.json](#23-turbojson)
   - [pnpm-workspace.yaml](#24-pnpm-workspaceyaml)
   - [packages/config/tsconfig/\*](#25-packagesconfigtsconfig)
3. [Рантайм-настройки в БД (`app_settings`)](#3-рантайм-настройки-в-бд-app_settings)
4. [Service Worker (versioning)](#4-service-worker-versioning)

---

## 1. Переменные окружения

Все переменные для production-деплоя хранятся в файле `.env` в корне репозитория. Файл монтируется через `env_file: .env` в сервисы `api`, `web`, `wallet`, `bot-admin`, `bot-wallet` (см. `docker-compose.yml`).

> **Замечание о кавычках.** Docker Compose иногда сохраняет кавычки вокруг значений `.env`. Модуль `apps/api/src/modules/ai/ai.router.ts` явно зачищает их через функцию `clean()` для `POLZA_*` переменных.

### 1.1 Обязательные (все сервисы)

| Переменная | Обязательная | Описание |
|---|---|---|
| `POSTGRES_PASSWORD` | **Да** | Пароль PostgreSQL-пользователя `titan`. Используется в `DATABASE_URL`, который собирается в `docker-compose.yml`. При отсутствии compose упадёт с `:?` expansion. |
| `JWT_SECRET` | **Да** | Секретный ключ для подписи JWT-токенов. Минимум 32 символа — API проверяет длину при старте (`apps/api/src/index.ts`) и завершает процесс с кодом 1, если условие не выполнено. Используется во всех сервисах для верификации токенов. |

### 1.2 API (`apps/api`)

Файл точки входа: `apps/api/src/index.ts`. Переменные считываются через `process.env['VAR']`.

#### База данных и Redis

| Переменная | Обязательная | Умолчание | Описание |
|---|---|---|---|
| `DATABASE_URL` | **Да** | — | PostgreSQL DSN вида `postgresql://titan:<POSTGRES_PASSWORD>@postgres:5432/titan_hub`. В docker-compose собирается автоматически из `POSTGRES_PASSWORD`. |
| `REDIS_URL` | Нет | `redis://redis:6379` | URL подключения к Redis. Используется для rate-limit, кэша WebAuthn-challenge, PubSub (`titan:updates`), SSE-потока и кэша связки планшет-зона. |

#### JWT и аутентификация

| Переменная | Обязательная | Умолчание | Описание |
|---|---|---|---|
| `JWT_SECRET` | **Да** | — | Ключ подписи JWT (≥ 32 символов). Fail-fast при старте API (`apps/api/src/index.ts`). |
| `FRONTEND_URL` | Нет | `http://localhost:3000` | Разрешённый CORS-origin (`apps/api/src/app.ts`). В prod: `https://titanpos.ru`. |

#### WebAuthn / Passkey

Источник: `apps/api/src/modules/auth/auth.router.ts`.

| Переменная | Обязательная | Умолчание | Описание |
|---|---|---|---|
| `WEBAUTHN_RP_NAME` | Нет | `Titan HUB` | Человекочитаемое имя Relying Party, отображаемое в диалоге браузера при регистрации passkey. |
| `WEBAUTHN_RP_ID` | Нет | `localhost` | Домен Relying Party — должен совпадать с `Origin` без протокола/порта. В prod: `titanpos.ru`. |
| `WEBAUTHN_ORIGIN` | Нет | `http://localhost:3000` | Полный Origin для верификации ответов. В prod: `https://titanpos.ru`. |

#### Web Push / VAPID

Источник: `apps/api/src/modules/notifications/push.ts`.

Если хотя бы одна из трёх переменных не задана, web push отключается полностью (no-op). Приложение продолжает работать через SSE-уведомления и запись в БД.

| Переменная | Обязательная | Описание |
|---|---|---|
| `VAPID_PUBLIC_KEY` | Нет* | Публичный VAPID-ключ (base64url). Отдаётся клиенту через `GET /api/notifications/push/key`. Также используется ботами для отправки. |
| `VAPID_PRIVATE_KEY` | Нет* | Приватный VAPID-ключ. Используется только сервером для подписи push-запросов к браузерному push-сервису. |
| `VAPID_SUBJECT` | Нет* | Контактный URI в формате `mailto:admin@example.com` или `https://...`. Требование Web Push Protocol. <!-- VERIFY: конкретный адрес для prod --> |

\* Все три нужны одновременно — при отсутствии любой push отключается.

> Генерация новой пары ключей:
> ```bash
> npx web-push generate-vapid-keys
> ```

#### Telegram-боты

Источник: `apps/api/src/modules/auth/auth.router.ts`, `apps/api/src/modules/notifications/push.ts`, `apps/api/src/modules/staff/staff.router.ts`, `apps/api/src/modules/clients/clients.router.ts`.

| Переменная | Обязательная | Умолчание | Описание |
|---|---|---|---|
| `ADMIN_BOT_TOKEN` | Нет | — | Токен Telegram-бота персонала (`apps/bot-admin`). Используется API для: (1) верификации `initData` при Telegram-логине (`POST /auth/login/telegram`), (2) отправки уведомлений сотрудникам через Telegram. |
| `WALLET_BOT_TOKEN` | Нет | — | Токен Telegram-бота кошелька клиентов (`apps/bot-wallet`). Используется API для: (1) верификации `initData` клиента, (2) отправки уведомлений клиентам о балансе/депозитах. |
| `ADMIN_BOT_USERNAME` | Нет | — | Username admin-бота (без `@`). Используется в `staff.router` для формирования deep-link при привязке Telegram-аккаунта сотрудника (`/staff/:id/telegram-link`). |
| `WALLET_BOT_USERNAME` | Нет | `titanwalletrobot` | Username wallet-бота. Используется для формирования deep-link кошелька клиента (`https://t.me/<WALLET_BOT_USERNAME>?start=<payload>`). |

#### MinIO (хранение изображений)

Источник: `apps/api/src/modules/upload/upload.router.ts`.

| Переменная | Обязательная | Умолчание | Описание |
|---|---|---|---|
| `MINIO_ACCESS_KEY` | **Да** (в compose) | `minioadmin` | Access key MinIO. Дублируется как `MINIO_ROOT_USER` в сервисе minio в compose. |
| `MINIO_SECRET_KEY` | **Да** (в compose) | `minioadmin` | Secret key MinIO. Дублируется как `MINIO_ROOT_PASSWORD` в сервисе minio в compose. |
| `MINIO_ENDPOINT` | Нет | `minio` | Hostname MinIO внутри Docker-сети. |
| `MINIO_PORT` | Нет | `9000` | Порт MinIO API. |
| `MINIO_PUBLIC_URL` | Нет | `http://localhost:9000` | Публичный базовый URL для ссылок на загруженные файлы. В prod совпадает с nginx `/media/` роутом, который проксирует MinIO. <!-- VERIFY: точный публичный URL для prod --> |

Бакет для загрузок: `titan-uploads`. Создаётся автоматически при первой загрузке. Максимальный размер файла — 2 МБ. Разрешённые типы: `image/jpeg`, `image/png`, `image/webp`, `image/gif` (проверяются по magic-bytes).

#### AI (TITAN AI / Polza)

Источник: `apps/api/src/modules/ai/ai.router.ts`.

| Переменная | Обязательная | Умолчание | Описание |
|---|---|---|---|
| `POLZA_API_KEY` | Нет | — | API-ключ провайдера Polza (OpenAI-совместимый endpoint). Без ключа `/api/ai/chat` вернёт ошибку. <!-- VERIFY: актуальный prod-ключ --> |
| `POLZA_BASE_URL` | Нет | `https://polza.ai/api/v1` | Базовый URL Polza API. Совместим с OpenAI `chat/completions`. |
| `POLZA_MODEL` | Нет | `google/gemini-3.1-flash-lite` | Идентификатор модели. Формат: `<provider>/<model>`. В production используется `anthropic/claude-sonnet-4.6`. |

Логика: `POST /api/ai/chat` вызывает `callAI()` → `${POLZA_BASE}/chat/completions` с bearer-авторизацией. Ответ — text-to-SQL по схеме БД (READ ONLY транзакция) или готовые аналитические отчёты.

#### Платёжный провайдер Platega (эквайринг / СБП QR)

Источник: `apps/api/src/modules/pos/pos.router.ts`, `apps/api/src/modules/platega/platega.router.ts`.

| Переменная | Обязательная | Описание |
|---|---|---|
| `PLATEGA_MERCHANT_ID` | Нет* | Идентификатор мерчанта в Platega. Используется в заголовке `X-MerchantId` при запросах к `https://app.platega.io`. Также проверяется в webhook-хендлере `POST /api/platega/webhook` для валидации входящих запросов (timing-safe compare). |
| `PLATEGA_SECRET` | Нет* | Секрет мерчанта Platega. Используется в заголовке `X-Secret`. Проверяется в webhook-хендлере. <!-- VERIFY: актуальные prod-значения --> |

\* Если не заданы — эндпоинт `POST /api/checks/:id/qr` возвращает `503 Platega не настроен`.

#### Rate Limiting (Hono-middleware)

Источник: `apps/api/src/middleware/rateLimit.ts`.

| Переменная | Обязательная | Умолчание | Описание |
|---|---|---|---|
| `RATELIMIT_ANON` | Нет | `120` | Лимит запросов в минуту для анонимных клиентов (ключ: IP). |
| `RATELIMIT_AUTH` | Нет | `600` | Лимит запросов в минуту для аутентифицированных пользователей (ключ: userId). |

Дополнительно на уровне nginx настроен rate limit: `limit_req_zone ... rate=30r/s` для `/api/` и `rate=5r/m` для `/api/auth/login`.

#### Бэкап и rclone (Google Drive)

Источник: `apps/api/src/lib/backup.ts`. Функциональность доступна через кнопки в разделе «О системе» (`/manage/about`).

| Переменная | Обязательная | Умолчание | Описание |
|---|---|---|---|
| `BACKUP_DIR` | Нет | `/backups` | Путь внутри контейнера для локальных дампов БД. В compose примонтирован как `/opt/backups:/backups`. |
| `BACKUP_RCLONE_REMOTE` | Нет | `gdrive` | Имя rclone-remote для Google Drive. |
| `BACKUP_RCLONE_DIR` | Нет | `titan-backups` | Директория внутри Google Drive для хранения дампов. |
| `BACKUP_KEEP_DAYS` | Нет | `14` | Срок хранения бэкапов (дни). Старые файлы ротируются локально и в Google Drive. |
| `RCLONE_CONFIG` | Нет | — | Путь к конфигу rclone внутри контейнера. В compose монтируется `/root/.config/rclone:/root/.config/rclone:ro`. <!-- VERIFY: путь на хосте --> |

Дамп создаётся командой `pg_dump --clean --if-exists --no-owner --no-privileges | gzip`. Пароль БД передаётся через переменные окружения PGPASSWORD (не в аргументах командной строки).

#### Прочие переменные API

| Переменная | Обязательная | Умолчание | Описание |
|---|---|---|---|
| `API_PORT` | Нет | `3001` | Порт HTTP-сервера Hono. |
| `NODE_ENV` | Нет | — | Среда выполнения (`development`/`production`). Отдаётся в `GET /api/system/info`. |
| `npm_package_version` | Нет | `1.0.0` | Версия пакета (проставляется npm/pnpm автоматически). Отдаётся в `GET /api/system/info`. |

### 1.3 Web-фронтенд (`apps/web`)

Источник: `apps/web/src/lib/api.ts`, `apps/web/src/store/auth.store.ts`, `apps/web/src/lib/sse.ts`.

| Переменная | Обязательная | Умолчание | Описание |
|---|---|---|---|
| `NEXT_PUBLIC_API_URL` | Нет | `/api` | Базовый URL API для fetch-запросов с клиента. В docker-compose задаётся явно как `/api` (относительный путь через nginx-прокси). При локальной разработке — `http://localhost:3001`. |

В production `NEXT_PUBLIC_API_URL=/api` — все запросы идут через nginx reverse proxy к `http://api:3001`.

### 1.4 Wallet (`apps/wallet`)

Источник: `apps/wallet/src/app/page.tsx`.

| Переменная | Обязательная | Умолчание | Описание |
|---|---|---|---|
| `NEXT_PUBLIC_API_URL` | Нет | `https://titanpos.ru` | Базовый URL для API-запросов кошелька. Используется с абсолютными путями вида `${API_URL}/api/...`, поэтому `basePath: '/wallet'` на него не влияет. |

Приложение кошелька собирается с `basePath: '/wallet'` и `assetPrefix: '/wallet'` (`apps/wallet/next.config.ts`), чтобы все статические чанки приходили на путь `/wallet/_next/static/*`. Nginx перехватывает эти пути через `location ^~ /wallet/` с приоритетом над regex-локейшенами.

### 1.5 Bot-Admin (`apps/bot-admin`)

Источник: `apps/bot-admin/src/index.ts`.

| Переменная | Обязательная | Умолчание | Описание |
|---|---|---|---|
| `ADMIN_BOT_TOKEN` | **Да** | — | Токен Telegram-бота. Без него бот не запустится (`process.exit(1)`). |
| `JWT_SECRET` | **Да** | — | Используется как `LINK_SECRET` — для верификации токена привязки Telegram при `/start <payload>`. |
| `API_URL` | Нет | `http://api:3001` | Внутренний URL API для исходящих запросов из бота. |
| `ADMIN_TG_IDS` | Нет | `''` | Список Telegram user ID через запятую, которым разрешён доступ к admin-командам бота. <!-- VERIFY: актуальный список prod --> |

### 1.6 Bot-Wallet (`apps/bot-wallet`)

Источник: `apps/bot-wallet/src/index.ts`.

| Переменная | Обязательная | Умолчание | Описание |
|---|---|---|---|
| `WALLET_BOT_TOKEN` | **Да** | — | Токен Telegram-бота кошелька. Без него бот не запустится. |
| `JWT_SECRET` | **Да** | — | Используется как `LINK_SECRET` — для верификации токена привязки Telegram при `/start <payload>`. |
| `WALLET_WEBAPP_URL` | Нет | `https://titanpos.ru/wallet` | URL Telegram Mini App кошелька. Встраивается в кнопку бота. <!-- VERIFY: актуальный prod URL --> |

---

## 2. Конфигурационные файлы

### 2.1 `docker-compose.yml`

Расположение: `/docker-compose.yml` (корень репозитория).

Описывает 8 сервисов в сети `titan-net` (bridge):

| Сервис | Контейнер | Mem limit | Порты | Описание |
|---|---|---|---|---|
| `postgres` | `titan-postgres` | 768 МБ | внутренний `5432` | PostgreSQL 16-alpine. Данные в volume `postgres-data`. Healthcheck: `pg_isready`. |
| `redis` | `titan-redis` | 256 МБ | внутренний `6379` | Redis 7-alpine с AOF (`--appendonly yes`). Данные в `redis-data`. |
| `minio` | `titan-minio` | 512 МБ | внутренний `9000/9001` | MinIO RELEASE.2023-06-29. Данные в `minio-data`. Console на порту 9001. |
| `api` | `titan-api` | 768 МБ | внутренний `3001` | Hono API. `env_file: .env`. Ждёт healthy postgres и redis. Запускает миграции при старте. Volumes: `/opt/backups:/backups`, `/root/.config/rclone:ro`. |
| `web` | `titan-web` | 768 МБ | внутренний `3000` | Next.js PWA (standalone). `NEXT_PUBLIC_API_URL=/api` задан явно в compose. |
| `wallet` | `titan-wallet` | 512 МБ | внутренний `3002` | Next.js кошелёк (standalone, basePath `/wallet`). |
| `bot-admin` | `titan-bot-admin` | 256 МБ | — | Telegram-бот персонала. DATABASE_URL собирается в compose. |
| `bot-wallet` | `titan-bot-wallet` | 256 МБ | — | Telegram-бот кошелька. DATABASE_URL собирается в compose. |
| `nginx` | `titan-nginx` | 128 МБ | `80:80`, `443:443` | Nginx reverse proxy. Монтирует `./nginx/nginx.conf:ro` и `./nginx/ssl:ro`. Стартует только после healthy api+web+wallet. |

**Volumes:** `postgres-data`, `redis-data`, `minio-data`, `nginx-cache`.

**Зависимости запуска:** `nginx` → `api` (healthy) + `web` (healthy) + `wallet` (healthy). `api` → `postgres` (healthy) + `redis` (healthy). Это закрывает окно 502 при холодном старте хоста, когда API ещё прогоняет миграции.

### 2.2 `nginx/nginx.conf`

Расположение: `nginx/nginx.conf` (монтируется в nginx-контейнер как `/etc/nginx/nginx.conf:ro`).

**SSL-сертификаты:** `/etc/nginx/ssl/fullchain.pem` и `/etc/nginx/ssl/privkey.pem` (монтируются из `./nginx/ssl/`). <!-- VERIFY: способ получения/обновления сертификатов (Let's Encrypt / certbot) -->

**Домены:** `titanpos.ru`, `www.titanpos.ru`. HTTP (80) → HTTPS (301 redirect).

**Протоколы:** TLSv1.2, TLSv1.3. HSTS: `max-age=31536000; includeSubDomains`.

**Rate limiting (nginx-уровень):**
- Зона `api`: 30 req/s, burst=50 — для всех `/api/` запросов.
- Зона `auth`: 5 req/min, burst=10 — только для `/api/auth/login`.

**Роутинг upstream:**

| Location | Upstream | Кэш |
|---|---|---|
| `/api/` | `http://api:3001` | Нет. `proxy_read_timeout 300s`. |
| `/api/auth/login` | `http://api:3001` | Нет. Дополнительный rate limit. |
| `/api/system/update` | `http://api:3001` | Отключён (SSE). `Connection: ''`, `proxy_buffering off`, `proxy_read_timeout 600s`. |
| `/media/` | `http://minio:9000` (через `set $minio_upstream`) | `expires 30d; Cache-Control: public, immutable`. Использует runtime resolver `127.0.0.11` чтобы не ронять nginx при недоступном MinIO. |
| `^~ /wallet/` и `= /wallet` | `http://wallet:3002` | Нет для HTML. `/_next/static/` внутри: `max-age=31536000, immutable`. |
| `/_next/static/` | `http://web:3000` | `max-age=31536000, immutable`. |
| `~* \.(js\|css\|...)$` | `http://web:3000` | `max-age=86400`. |
| `/` | `http://web:3000` | `no-cache, no-store, must-revalidate` (скрывает Cache-Control Next.js). |

`client_max_body_size` — 10 МБ.

> **Важно про `/wallet/`.** Nginx использует `location ^~ /wallet/` (приоритетный префикс), чтобы чанки кошелька (`/wallet/_next/static/...`) не перехватывались regex-локейшеном `~* \.(js|css|...)$` и не попадали на `web:3000`.

### 2.3 `turbo.json`

Расположение: `/turbo.json`.

Turbo v2 (ui: tui). Описывает пайплайн задач монорепо:

| Задача | `dependsOn` | `cache` | Артефакты (`outputs`) |
|---|---|---|---|
| `build` | `^build` (сначала зависимости) | Да | `.next/**` (без `.next/cache/**`), `dist/**`, `.drizzle/**` |
| `dev` | — | Нет (`persistent: true`) | — |
| `lint` | `^build` | Да | — |
| `type-check` | `^build` | Да | — |
| `clean` | — | Нет | — |
| `db:generate` | — | Нет | — |
| `db:migrate` | — | Нет | — |
| `db:push` | — | Нет | — |
| `db:studio` | — | Нет (`persistent: true`) | — |

Входы для задачи `build` включают `$TURBO_DEFAULT$` и `.env*` файлы.

### 2.4 `pnpm-workspace.yaml`

Расположение: `/pnpm-workspace.yaml`.

```yaml
packages:
  - "apps/*"
  - "packages/*"
allowBuilds:
  esbuild: true
  msgpackr-extract: true
  sharp: true
```

Два воркспейса: `apps/*` (web, api, wallet, bot-admin, bot-wallet) и `packages/*` (database, auth, types, ui, config). Явно разрешены нативные сборки `esbuild`, `msgpackr-extract`, `sharp`.

### 2.5 `packages/config/tsconfig/*`

Расположение: `packages/config/tsconfig/`.

#### `base.json` — основа для всех пакетов

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022"],
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "exactOptionalPropertyTypes": true,
    "noUncheckedIndexedAccess": true,
    "noImplicitOverride": true,
    "skipLibCheck": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "esModuleInterop": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "isolatedModules": true
  }
}
```

#### `node.json` — для Node-сервисов (API, боты)

Расширяет `base.json`. Добавляет `outDir: "dist"`, `rootDir: "src"`. Включает `src/**/*`.

#### `nextjs.json` — для Next.js-приложений (web, wallet)

Расширяет `base.json`. Отличия: `target: "ES2017"`, `module: "ESNext"`, `moduleResolution: "Bundler"`, `jsx: "preserve"`, `allowJs: true`, `incremental: true`, plugin `next`, path alias `@/*` → `./src/*`.

---

## 3. Рантайм-настройки в БД (`app_settings`)

Таблица `app_settings` (схема: `packages/database/src/schema/notifications.ts`):

```sql
CREATE TABLE app_settings (
  key         TEXT PRIMARY KEY,
  value       TEXT NOT NULL,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

Хранит строковые значения (числа, булевы — как строки). Читается через хелперы `getNumericSetting(key, fallback)` и `getBoolSetting(key, fallback)` из `apps/api/src/lib/appSettings.ts`. Функции никогда не бросают исключений — при ошибке возвращают fallback.

**API управления:**
- `GET /api/system/settings` — прочитать все настройки (роли: `owner`, `staff`).
- `PATCH /api/system/settings` — обновить/создать 1–50 настроек (роль: `owner`). Ключи — regex `/^[a-z][a-z0-9_]{0,63}$/`, значение ≤ 2000 символов.

### Известные ключи

| Ключ | Тип | Умолчание | Где используется | Описание |
|---|---|---|---|---|
| `max_client_debt` | число | `0` (без лимита) | `clients.router.ts`, `pos.router.ts` | Максимальный долг клиента (рублей). `> 0` — ограничение активно. `0` или пусто — без лимита. Применяется при пополнении/снятии баланса и при оплате чека «в долг». |
| `large_check_threshold` | число | `3000` | `pos.router.ts` (константа `LARGE_CHECK_KEY`) | Порог суммы чека для отправки уведомления «Крупный чек» (`large_check`). |
| `large_refund_threshold` | число | `3000` | `refunds.router.ts` (константа `LARGE_REFUND_KEY`) | Порог суммы возврата для уведомления «Крупный возврат» (`large_refund`). |
| `staff_discount_enabled` | булево | `false` | `pos.router.ts` (константа `STAFF_DISCOUNT_KEY`) | Включить ли скидку для сотрудников при закрытии чека. |
| `bonus_enabled` | булево | `true`* | `pos.router.ts`, `platega.router.ts`, `birthdays.ts` | Глобальное включение/выключение бонусной программы. |
| `bonus_accrual_rate` | число (%) | `5` | `pos.router.ts`, `platega.router.ts`, `refunds.router.ts` | Процент начисления бонусов от суммы чека. Например, `5` = 5%. |
| `bonus_min_purchase` | число | `0` | `pos.router.ts`, `platega.router.ts` | Минимальная сумма покупки для начисления бонусов. |
| `bonus_max_spend` | число | — | `pos.router.ts` | Максимальная сумма бонусов, которую можно списать за один чек. |
| `bonus_accrual_on_debt` | булево | `false` | `pos.router.ts` | Начислять ли бонусы при оплате «в долг». |
| `bonus_expiry_days` | число | — | `bonusLots.ts` (функция `getBonusExpiryDays`) | Срок сгорания бонусов (дни). Если не задан или 0 — бонусы не сгорают. |
| `birthday_bonus_enabled` | булево | `false` | `cron/birthdays.ts` | Включить автоматическое начисление бонусов в день рождения клиента. |
| `birthday_bonus_amount` | число | `0` | `cron/birthdays.ts` | Сумма бонусов, начисляемых в день рождения. |

\* `bonus_enabled` — считается `true` если значение отличается от строки `'false'`.

> **Cron дней рождения.** `apps/api/src/cron/birthdays.ts` запускается ежедневно в 09:00 МСК (06:00 UTC). Если `bonus_enabled` и `birthday_bonus_enabled` оба активны — начисляет `birthday_bonus_amount` бонусов всем клиентам с днём рождения сегодня.

---

## 4. Service Worker (versioning)

Расположение: `apps/web/public/sw.js`.

```javascript
const CACHE_VERSION = 'v211'
const STATIC_CACHE  = `titan-static-${CACHE_VERSION}`   // /_next/static/*
const RUNTIME_CACHE = `titan-runtime-${CACHE_VERSION}`  // прочие GET-запросы
```

### Стратегии кэширования

| Тип ресурса | Стратегия | Cache |
|---|---|---|
| `/_next/static/*` | Cache-first | `titan-static-<ver>` |
| `/api/*` | Network-only (не кэшируется) | — |
| `/notifications/stream` (SSE) | Не перехватывается SW | — |
| HTML, прочие GET | Network-first, fallback кэш, timeout 8 сек | `titan-runtime-<ver>` |

API-запросы намеренно не кэшируются, чтобы актуальные данные (балансы, чеки) не оседали в кэше и не утекали между сессиями на общем киоске-планшете.

### Когда нужно бампать CACHE_VERSION

`CACHE_VERSION` нужно увеличить при любом изменении фронтенда (`apps/web`), которое должно быть немедленно доставлено всем пользователям. При смене версии SW:

1. Событие `activate` удаляет все старые кэши (ключи без суффикса текущей версии).
2. `self.skipWaiting()` при `install` гарантирует немедленную активацию нового SW.
3. `self.clients.claim()` при `activate` переключает все открытые вкладки на новый SW без перезагрузки.

**Как бампать:** изменить строку `CACHE_VERSION` в `apps/web/public/sw.js` (например, `v211` → `v212`) при каждом деплое, затрагивающем фронтенд. В `scripts/deploy.sh` это делается вручную перед коммитом.

> **Текущая версия в репозитории:** `v211`.
