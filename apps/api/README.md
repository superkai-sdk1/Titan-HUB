<!-- generated-by: gsd-doc-writer -->
# @titan/api

REST API бэкенд кассовой системы Titan HUB. Построен на [Hono](https://hono.dev/) + `@hono/node-server`, TypeScript, Drizzle ORM. Реализует полный цикл работы игрового клуба/антикафе: кассовые операции (POS), склад, клиенты, смены/касса, аналитика, TITAN AI-ассистент, сборы резидентов и вспомогательные сервисы.

---

## Содержание

- [Зависимости и связи с монорепо](#зависимости-и-связи-с-монорепо)
- [Точка входа и старт](#точка-входа-и-старт)
- [Структура модулей](#структура-модулей)
- [Маршруты API](#маршруты-api)
- [Middleware](#middleware)
- [Миграции](#миграции)
- [Ключевые механизмы](#ключевые-механизмы)
- [Команды разработки](#команды-разработки)
- [Переменные окружения](#переменные-окружения)

---

## Зависимости и связи с монорепо

Пакет `@titan/api` использует три общих пакета монорепо:

| Пакет | Что предоставляет |
|---|---|
| `@titan/database` | Drizzle-клиент `db`, все таблицы и операторы (`eq`, `and`, `sql`, …), схема БД |
| `@titan/auth` | `signToken` / `verifyToken` (JWT), `hashPassword` / `verifyPassword`, `hashPin` / `verifyPin`, `verifyTelegramInitData` |
| `@titan/types` | Общие Zod-схемы запросов (`LoginPinSchema`, `LoginPasswordSchema` и др.) |

Внешние runtime-зависимости: `hono`, `drizzle-orm`, `zod`, `@hono/zod-validator`, `@simplewebauthn/server` (WebAuthn/Passkey), `web-push` (VAPID-уведомления), `ioredis`, `bullmq`, `minio`, `qrcode`, `@anthropic-ai/sdk`.

---

## Точка входа и старт

**`src/index.ts`** — точка входа сервера. Выполняет три действия по порядку:

1. **Проверка обязательных переменных** (`assertEnv`): сервер упадёт с `process.exit(1)`, если не заданы `JWT_SECRET` (минимум 32 символа) или `DATABASE_URL`.
2. **Миграции** (`runMigrations()`): применяет все новые SQL-миграции из `src/migrations/sql/`. Сервер стартует только после успешного завершения миграций.
3. **HTTP-сервер**: `@hono/node-server` на порту `API_PORT` (по умолчанию `3001`).

Дополнительно: по расписанию (09:00 МСК = 06:00 UTC) запускается крон `checkBirthdays` — рассылает уведомления о днях рождения клиентов.

Сам роутер приложения живёт в **`src/app.ts`**: там настроены CORS, `secureHeaders`, `bodyLimit`, глобальный rate-limiting, логгер запросов с маскированием токенов в URL, энфорсмент подписки клуба и смонтированы все модульные роутеры.

---

## Структура модулей

Каждый модуль расположен в `src/modules/<name>/` и содержит как минимум файл `<name>.router.ts`. Часть модулей имеет отдельные сервисные файлы (`*.service.ts`).

```
src/
├── index.ts                  — старт сервера, миграции, крон
├── app.ts                    — Hono-приложение, монтирование роутеров
├── types.ts                  — AppEnv (Hono generic с переменными контекста)
├── middleware/
│   ├── auth.ts               — requireAuth, requireRole, tokenHash
│   └── rateLimit.ts          — rate-limiting через Redis
├── migrations/
│   ├── runner.ts             — раннер миграций
│   └── sql/                  — SQL-файлы 001_…053_ (в алфавитном порядке)
├── lib/
│   ├── appSettings.ts        — кэш настроек приложения из БД
│   ├── backup.ts             — утилиты резервного копирования
│   ├── bonusLots.ts          — FIFO-списание бонусных лотов
│   ├── clientIp.ts           — резолвер реального IP клиента
│   ├── dateFmt.ts            — форматирование дат по МСК
│   ├── loyalty.ts            — прогресс лояльности (visitProgress)
│   ├── money.ts              — round2 — округление до 2 знаков
│   ├── redis.ts              — shared Redis-клиент
│   ├── shiftForecast.ts      — прогноз выручки смены (computeShiftForecast)
│   └── subscription.ts       — статус подписки клуба
├── cron/
│   └── birthdays.ts          — крон поздравлений
└── modules/
    ├── ai/                   — TITAN AI-ассистент
    ├── analytics/            — аналитика: дашборд, выручка, оплаты, товары, тарифы, мероприятия
    ├── auth/                 — аутентификация, passkeys, self-профиль
    ├── cashops/              — кассовые операции смены
    ├── certificates/         — подарочные сертификаты
    ├── clients/              — клиенты (profiles с role=client)
    ├── club/                 — подписка клуба, статус (control-plane)
    ├── collections/          — сборы резидентов (Фонд клуба и разовые взносы)
    ├── customers/            — заказчики мероприятий
    ├── discounts/            — скидки и правила скидок по тирам
    ├── events/               — мероприятия
    ├── expenses/             — расходы
    ├── gomafia/              — интеграция GoMafia (подбор игроков)
    ├── internal/             — внутренний межсервисный роутер
    ├── inventory/            — склад (остатки, ревизии, движения)
    ├── menu/                 — меню: категории, позиции, модификаторы
    ├── notifications/        — push + Telegram уведомления
    ├── platega/              — webhook эквайринга Platega
    ├── pos/                  — кассовые чеки, заказы, прогноз смены, чат
    ├── pricing/              — тарифы, типы вечеров, аренда почасово
    ├── refunds/              — возвраты по чекам
    ├── salary/               — расчёт и выплата зарплаты
    ├── shifts/               — смены
    ├── spaces/               — зоны/столы
    ├── staff/                — сотрудники (owner-only CRUD)
    ├── superadmin/           — control-plane суперадмина (auth, клубы, биллинг)
    ├── supplies/             — поставки
    ├── system/               — системные настройки, бэкапы, обновления
    ├── tg/                   — Telegram-бот межсервисный роутер
    └── upload/               — загрузка изображений в MinIO
```

---

## Маршруты API

Все роутеры смонтированы с префиксом `/api` в `src/app.ts`. Сводная таблица:

| Префикс | Модуль | Краткое описание |
|---|---|---|
| `GET /api/health` | — | Health-check, возвращает `{ ok: true, ts }` |
| `/api/auth` | `auth` | Вход по PIN/паролю/Telegram, passkey/WebAuthn, self-профиль, logout, SSE-тикет |
| `/api/pos` | `pos` | Кассовые чеки, добавление позиций, заказы, прогноз смены (`shift-summary`), чат кассира ↔ гость |
| `/api/shifts` | `shifts` | Текущая смена, открытие/закрытие, аналитика смены, остаток кассы, дни рождения |
| `/api/cashops` | `cashops` | Внесения и изъятия наличных в рамках открытой смены |
| `/api/menu` | `menu` | Категории и позиции меню, модификаторы, переупорядочивание |
| `/api/inventory` | `inventory` | Остатки, ревизии (draft/apply), история движений, статистика позиции |
| `/api/supplies` | `supplies` | Поставки (создание, черновик, применение), последняя цена позиции |
| `/api/clients` | `clients` | Клиенты: CRUD, баланс (депозит/долг), бонусы, транзакции, тиры, Telegram-связка |
| `/api/collections` | `collections` | Сборы резидентов: Фонд клуба (recurring) и разовые взносы (oneoff), оплата, исключения, периоды |
| `/api/customers` | `customers` | Заказчики мероприятий: CRUD |
| `/api/events` | `events` | Мероприятия: CRUD, участники |
| `/api/spaces` | `spaces` | Зоны/столы: CRUD, soft delete, код для планшета |
| `/api/pricing` | `pricing` | Тарифы, типы вечеров, почасовые ставки мероприятий |
| `/api/discounts` | `discounts` | Скидки, правила скидок по клиентским тирам |
| `/api/certificates` | `certificates` | Подарочные сертификаты: выпуск, валидация кода, деактивация |
| `/api/salary` | `salary` | Расчёт зарплаты сотрудника, выплата (owner-only) |
| `/api/refunds` | `refunds` | Возвраты по чекам, восстановление остатков |
| `/api/expenses` | `expenses` | Расходы: CRUD, сводка, каталог статей |
| `/api/notifications` | `notifications` | SSE-поток, push-подписка (VAPID), Telegram-связка, настройки типов |
| `/api/ai` | `ai` | `POST /chat` и `POST /action` — TITAN AI-ассистент |
| `/api/analytics` | `analytics` | Дашборд, обзор, выручка, оплаты, товары, тарифы, клиенты, сегменты, мероприятия |
| `/api/system` | `system` | Информация о версии, настройки приложения, бэкапы, SSE-обновление |
| `/api/upload` | `upload` | `POST /image` — загрузка изображения в MinIO |
| `/api/staff` | `staff` | Сотрудники: CRUD (owner-only), сброс PIN, passkeys, Telegram-связка |
| `/api/platega` | `platega` | `POST /webhook` — коллбэк эквайринга Platega |
| `/api/gomafia` | `gomafia` | Интеграция GoMafia: поиск игроков, резиденты клуба, статистика |
| `/api/club` | `club` | Статус подписки клуба (control-plane, проверка грейс/блок) |
| `/api/superadmin` | `superadmin` | Суперадмин control-plane: auth, управление клубами, биллинг |
| `/api/tg` | `tg` | Межсервисный Telegram-роутер (внутренние события от ботов) |
| `/api/internal` | `internal` | Внутренний межсервисный роутер (shared secret) |

### Примеры ключевых эндпоинтов

```
# Вход по PIN (staff/owner fan-out)
POST /api/auth/login/pin
{ "pin": "1234" }

# Открытие чека
POST /api/pos/checks
{ "spaceId": "...", "playerIds": [...] }

# Прогноз выручки текущей смены
GET /api/pos/shift-summary

# Аналитика мероприятий
GET /api/analytics/events?from=2025-01-01&to=2025-01-31

# Сборы резидентов — оплата взноса
POST /api/collections/:id/pay
{ "playerId": "...", "method": "deposit", "periodId": "..." }

# Пополнение баланса клиента
POST /api/clients/:id/balance
{ "amount": 500, "type": "deposit", "idempotencyKey": "..." }

# Применение поставки
POST /api/supplies/:id/apply
{ "items": [{ "itemId": "...", "quantity": 10, "unitCost": 120 }] }

# TITAN AI — запрос к ассистенту
POST /api/ai/chat
{ "message": "Сколько выручки за вчера?" }
```

---

## Middleware

### `src/middleware/auth.ts`

**`requireAuth`** — проверяет JWT в запросе. Поддерживает три способа передачи токена:

1. Заголовок `Authorization: Bearer <token>` — основной способ.
2. Query-параметр `?token=<token>` — легаси-путь для SSE (EventSource не поддерживает заголовки).
3. Query-параметр `?ticket=<ticket>` — одноразовый короткоживущий тикет (60 сек), выдаётся через `POST /api/auth/sse-ticket`. Тикет хранится в Redis и удаляется при первом использовании.

После верификации подписи токена выполняется проверка отзыва через Redis (`revoked:<sha256(token)>`). Если Redis недоступен — fail-open (авторизация пропускается).

**`requireRole(...roles)`** — проверяет, что `user.role` из JWT входит в список разрешённых. Допустимые роли: `owner`, `staff`, `tablet`, `client`.

**`tokenHash(token)`** — вычисляет SHA-256 хэш токена для ключа отзыва в Redis.

### `src/middleware/rateLimit.ts`

Rate-limiting через Redis. Лимиты настраиваются через переменные `RATELIMIT_ANON` и `RATELIMIT_AUTH`. PIN-эндпоинт имеет дополнительный глобальный счётчик неудачных попыток (`pin:fail:global`, потолок 50 за окно 15 минут), не зависящий от IP.

---

## Миграции

### Раннер: `src/migrations/runner.ts`

Запускается автоматически при старте API (`runMigrations()` вызывается в `src/index.ts` перед `serve()`). Алгоритм:

1. Создаёт таблицу `_migrations (id text PRIMARY KEY, applied_at timestamptz)` если не существует.
2. Читает все `.sql` файлы из `src/migrations/sql/` в алфавитном (числовом) порядке.
3. Сравнивает с уже применёнными записями из `_migrations`.
4. Каждый новый файл применяется в Drizzle-транзакции: сначала исполняется SQL, затем пишется запись в `_migrations`. При ошибке — откат транзакции и `process.exit(1)`.

### Файлы миграций: `src/migrations/sql/`

53 файла, формат `NNN_описание.sql`. Ключевые:

| Файл | Что вводит |
|---|---|
| `005_warehouse.sql` | Первичная схема склада |
| `013_bonus_lots.sql` | Бонусные лоты (FIFO-сгорание) |
| `019_customers.sql` | Таблица заказчиков мероприятий |
| `021_client_tiers.sql` | Клиентские тиры лояльности |
| `024_push_subscriptions.sql` | Push-подписки (VAPID) |
| `025_tariffs_evening_types.sql` | Тарифы и типы вечеров |
| `035_supply_corrections.sql` | Корректировки поставок |
| `036_analytics_events.sql` | Аналитика мероприятий |
| `043_revisions.sql` | Ревизии склада |
| `044_stock_ledger.sql` | Ledger движений склада (`stock_movements`) |
| `045_tx_idempotency.sql` | Идемпотентность транзакций баланса |
| `046_drafts.sql` | Черновики поставок и ревизий (`draft_data`) |
| `047_acquiring_surcharge.sql` | Доплата за эквайринг |
| `050_integrations.sql` | Таблица интеграций (GoMafia и др.) |
| `052_status_tariff_unify.sql` | Унификация статусов тарифов |
| `053_collections.sql` | Сборы резидентов: таблицы `collections`, `collection_periods`, `collection_contributions`, `collection_members` |

SQL-файлы должны быть идемпотентны (использовать `CREATE TABLE IF NOT EXISTS`, `ADD COLUMN IF NOT EXISTS` и т.п.) — это гарантирует безопасное повторное применение.

---

## Ключевые механизмы

### Склад — immutable ledger (`src/modules/inventory/ledger.ts`)

Единственная функция изменения складских остатков — `recordMovement(tx, input)`. Все write-сайты (POS-продажа, возврат, поставка, ревизия, ручная коррекция) обязаны вызывать её внутри транзакции.

**Алгоритм `recordMovement`:**

1. Блокирует строку товара `FOR UPDATE`.
2. Вычисляет `qtyAfter = max(0, before + delta)` (с `clamp=true` не уходит ниже нуля).
3. На приходе (`type='receipt'`, `delta > 0`) пересчитывает WAC (средневзвешенную себестоимость):
   ```
   avgCost = round2((before × oldCost + applied × unitCost) / qtyAfter)
   ```
4. Обновляет кэш `inventory.stock_quantity` и `cost_price` в той же транзакции.
5. Пишет строку в `stock_movements` (нулевую дельту не пишет).

**Инвариант:** `inventory.stock_quantity == SUM(stock_movements.delta)` по каждому товару.

**Типы движений:** `opening | receipt | sale | return | adjustment | write_off | count | transfer`

### Поставки и ревизии

**Поставки** (`/api/supplies`): документ `supplies` со статусами `draft → posted`. Черновик создаётся через `POST /api/supplies/draft` (поля в `draft_data` jsonb). Применение `POST /api/supplies/:id/apply` создаёт `supply_items` и проводит движения типа `receipt` через `recordMovement` для каждой позиции.

**Ревизии** (`/api/inventory/revisions`): документ `revisions` со статусами `draft → applied`. Аналогичная схема: `POST /api/inventory/revisions/draft` для черновика, `POST /api/inventory/revisions/:id/apply` для применения (движение типа `count`, `delta = фактический_остаток − текущий_остаток`).

### Сборы резидентов (`/api/collections`)

Модуль `collections` реализует регулярные и разовые взносы резидентов клуба, не проходящие через кассу.

**Типы сборов:** `recurring` (Фонд клуба — авто-период раз в месяц) и `oneoff` (разовый сбор).

**Способы оплаты:**
- `deposit` / `debt` — изменяют `profiles.balance`, создают запись в `transactions`, отображаются в истории игрока.
- `cash` / `transfer` / `sbp` — фиксируются в `collection_contributions` без изменения баланса (копилка мимо кассы).

**Исключения:** участник может быть исключён из периода на 1 месяц, 3 месяца, навсегда, либо с персональной суммой взноса.

**Важно:** роутер требует `requireAuth` через `.use` до `requireRole` — иначе возникнет 500.

### Прогноз выручки смены (`GET /api/pos/shift-summary`)

Реализован в `src/lib/shiftForecast.ts` (`computeShiftForecast`). Логика: для каждого открытого чека вычисляется projected = max(текущая сумма, средний чек резидента за 120 дней). При наличии ≥ 3 посещений применяется поправка на день недели. Гость без истории — берётся текущая сумма чека.

Ответ: `{ shift, openChecks: { count, total }, cashInRegister, forecast: { amount, currentTotal, additional, perCheck[] } }`.

### Аналитика мероприятий (`GET /api/analytics/events`)

Параметры: `?from=YYYY-MM-DD&to=YYYY-MM-DD`. Возвращает: количество мероприятий и часов, выручку, среднюю длительность/чек/выручку-за-час/гостей, разбивки по формату (Титан/Выезд/Миникап), загрузку по дням недели, топ заказчиков и зон. Окно фильтрации — по календарной дате события.

### Балансы клиентов — депозиты и долги

Авторитетное поле — `profiles.balance` (numeric): `> 0` — депозит, `< 0` — долг.

Эндпоинт `POST /api/clients/:id/balance` работает атомарно: блокирует строку `FOR UPDATE`, проверяет лимит долга из `app_settings.max_client_debt`, поддерживает идемпотентность через `idempotencyKey` (миграция 045). Все операции создают запись в `transactions` с типом `deposit / withdrawal / payment / refund / bonus_*`.

Фильтры GET `/api/clients?filter=deposits|debtors|balances` — выборки по знаку баланса.

### Смены и касса

**Сервис `src/modules/shifts/shifts.service.ts`:**

- `openShift(data)` — открывает смену. Применяет принцип **непрерывности кассы**: ожидаемый старт = `cashEnd` предыдущей смены. Любое расхождение фиксируется как кассовая операция с обязательной причиной.
- `getShiftCashBalance()` — живой остаток кассы:
  ```
  cashStart + наличные_платежи + внесения − изъятия − зарплаты − наличные_возвраты
  ```

**Кассовые операции** (`/api/cashops`): `deposit | withdrawal | salary`. Привязаны к открытой смене. Выплата зарплаты (`POST /api/salary/pay`) автоматически создаёт `cashOperation` типа `salary`.

### Аутентификация

Роли: `owner`, `staff`, `tablet`, `client`.

Способы входа:
- `POST /api/auth/login/pin` — fan-out по всем `staff/owner` (защищён rate-limiting: 5 попыток за 15 мин по IP + глобальный потолок 50 неудачных попыток).
- `POST /api/auth/login/password` — вход по паролю (для `owner`).
- `POST /api/auth/login/telegram` — вход по Telegram `initData`.
- Passkey/WebAuthn: `POST /api/auth/passkey/register/options`, `.../verify`, `POST /api/auth/passkey/authenticate/options`, `.../verify`.
- `POST /api/auth/tablet-session` — узкий токен `role=tablet` для планшета-киоска (выбор пространства + PIN сотрудника).

Self-эндпоинты (для авторизованного пользователя): `GET/PATCH /api/auth/me`, `GET /api/auth/me/transactions`, `GET /api/auth/me/bonus-lots`, `GET /api/auth/me/bonus-history`, `GET /api/auth/me/visit-progress`.

### TITAN AI (`src/modules/ai/ai.router.ts`)

`POST /api/ai/chat` и `POST /api/ai/action` — обработчик `handleChat`. Провайдер: Polza (переменные `POLZA_BASE_URL`, `POLZA_API_KEY`, `POLZA_MODEL`). Модель `anthropic/claude-sonnet-4-6` выполняет text-to-SQL по схеме БД и готовые аналитические отчёты. SQL-запросы выполняются в read-only транзакции. Результаты кэшируются в Redis.

### Уведомления (`src/modules/notifications/`)

- **Web Push (VAPID):** подписка через `POST /api/notifications/push/subscribe`, тест через `POST /api/notifications/push/test`. Ключи — `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`.
- **Telegram:** 6-значный код привязки через `POST /api/notifications/tg-link`, обрабатывается ботом `@titan/bot-admin`.
- **SSE-поток:** `GET /api/notifications/stream` (owner/staff) — real-time события. Требует тикет из `POST /api/auth/sse-ticket`.
- **Настройки типов:** `GET/PUT /api/notifications/settings` — per-user настройки типов (`staff_call`, `low_stock`, `supply_received`, `deposit_topup` и др.).

---

## Команды разработки

| Команда | Описание |
|---|---|
| `pnpm dev` | Запуск сервера в режиме watch (`tsx watch src/index.ts`) |
| `pnpm build` | TypeScript-компиляция + копирование SQL-файлов миграций в `dist/migrations/sql/` |
| `pnpm start` | Запуск скомпилированного `dist/index.js` |
| `pnpm type-check` | Проверка типов без эмита (`tsc --noEmit`) |
| `pnpm clean` | Удалить директорию `dist/` |

Запуск из корня монорепо (через Turborepo):

```bash
pnpm --filter @titan/api dev
pnpm --filter @titan/api build
```

---

## Переменные окружения

Полный список с описаниями — в [`docs/CONFIGURATION.md`](../../docs/CONFIGURATION.md).

Обязательные (сервер не стартует без них):

| Переменная | Описание |
|---|---|
| `DATABASE_URL` | URL подключения к PostgreSQL |
| `JWT_SECRET` | Секрет подписи JWT, минимум 32 символа |

Основные опциональные:

| Переменная | Дефолт | Описание |
|---|---|---|
| `API_PORT` | `3001` | Порт HTTP-сервера |
| `REDIS_URL` | `redis://redis:6379` | URL Redis (rate-limiting, кэш, отзыв токенов) |
| `FRONTEND_URL` | — | URL фронтенда (CORS) |
| `NODE_ENV` | — | Режим окружения (`production` / `development`) |
| `WEBAUTHN_RP_NAME` | `Titan HUB` | Название Relying Party для WebAuthn |
| `WEBAUTHN_RP_ID` | `localhost` | RP ID для WebAuthn (домен без схемы) |
| `WEBAUTHN_ORIGIN` | `http://localhost:3000` | Origin для WebAuthn (схема + домен + порт) |
| `VAPID_PUBLIC_KEY` | — | VAPID public key (Web Push) |
| `VAPID_PRIVATE_KEY` | — | VAPID private key (Web Push) |
| `VAPID_SUBJECT` | — | VAPID subject (`mailto:` или URL) |
| `POLZA_BASE_URL` | — | Base URL провайдера TITAN AI |
| `POLZA_API_KEY` | — | API-ключ провайдера TITAN AI |
| `POLZA_MODEL` | — | Модель AI (например `anthropic/claude-sonnet-4-6`) |
| `MINIO_ENDPOINT` | — | Хост MinIO (без схемы) |
| `MINIO_PORT` | — | Порт MinIO |
| `MINIO_ACCESS_KEY` | — | MinIO access key |
| `MINIO_SECRET_KEY` | — | MinIO secret key |
| `MINIO_PUBLIC_URL` | — | Публичный URL MinIO для отдачи изображений |
| `PLATEGA_MERCHANT_ID` | — | ID мерчанта эквайринга Platega |
| `PLATEGA_SECRET` | — | Секрет для верификации webhook Platega |
| `ADMIN_BOT_TOKEN` | — | Токен Telegram-бота администратора |
| `ADMIN_BOT_USERNAME` | — | Username Telegram-бота администратора |
| `WALLET_BOT_TOKEN` | — | Токен Telegram-бота кошелька клиентов |
| `WALLET_BOT_USERNAME` | — | Username Telegram-бота кошелька |
| `RATELIMIT_ANON` | — | Лимит запросов для анонимных (формат `N/window`) |
| `RATELIMIT_AUTH` | — | Лимит запросов для авторизованных |
| `BACKUP_DIR` | — | Директория для локальных бэкапов БД |
| `BACKUP_KEEP_DAYS` | — | Срок хранения локальных бэкапов (дней) |
| `BACKUP_RCLONE_REMOTE` | — | rclone remote для облачного бэкапа |
| `BACKUP_RCLONE_DIR` | — | Директория в rclone remote |
