<!-- generated-by: gsd-doc-writer -->
# Архитектура Titan HUB

## Обзор системы

Titan HUB — PWA-кассовая система для игрового клуба/антикафе. Покрывает весь жизненный
цикл посещения: открытие чека → продажа товаров и аренда зон → начисление бонусов → оплата
различными способами → закрытие чека. Параллельно ведёт складской учёт по принципу
immutable ledger, управляет клиентскими депозитами и долгами, сменами и кассой, лояльностью,
персоналом, событиями, аналитикой, сборами взносов с резидентов и интеграциями с внешними
сервисами (GoMafia, Platega, Telegram-боты, AI).

Архитектурный стиль: монолитный REST API (один Hono-сервис, модульная структура) +
Next.js App Router PWA-фронтенд. Данные хранятся в PostgreSQL (Drizzle ORM). Redis
используется для rate-limiting, отзыва токенов, SSE-уведомлений (Pub/Sub) и кэша
AI-ответов. MinIO — объектное хранилище для изображений (аватары, фото товаров).

---

## Монорепо: структура workspace

Сборка управляется **pnpm + Turborepo** (`pnpm-workspace.yaml`, `turbo.json`). Все
внутренние пакеты подключаются через алиасы `@titan/*`.

```
/                           ← корень монорепо
├── apps/
│   ├── api/                ← бэкенд (Hono, Node)
│   ├── web/                ← PWA-фронтенд (Next.js App Router, standalone)
│   ├── wallet/             ← Telegram WebApp кошелёк клиента (Next.js, basePath /wallet)
│   ├── bot-admin/          ← Telegram-бот персонала (уведомления, команды)
│   └── bot-wallet/         ← Telegram-бот клиентов (баланс, история)
├── packages/
│   ├── database/           ← Drizzle ORM: схема, клиент, экспорт db + операторов
│   ├── auth/               ← хелперы: JWT (signToken/verifyToken), PIN, пароль, Telegram
│   ├── types/              ← общие Zod-схемы и TypeScript-типы (LoginPinSchema и др.)
│   ├── ui/                 ← разделяемые UI-примитивы
│   └── config/             ← tsconfig/eslint base configs
├── docker-compose.yml
├── nginx/nginx.conf
└── scripts/deploy.sh
```

### Роль каждого `app`

| Приложение | Технология | Назначение |
|---|---|---|
| `apps/api` | Hono + @hono/node-server | REST API, порт 3001 |
| `apps/web` | Next.js 15 App Router (standalone) | PWA, порт 3000 |
| `apps/wallet` | Next.js (standalone, basePath `/wallet`) | Telegram WebApp кошелёк, порт 3002 |
| `apps/bot-admin` | Telegram Bot API | Уведомления персоналу, команды |
| `apps/bot-wallet` | Telegram Bot API | Клиентский бот (баланс, лоты бонусов) |

### Роль каждого `package`

| Пакет | Экспорты |
|---|---|
| `packages/database` | `db` (Drizzle client), все таблицы-объекты, Drizzle-операторы (`eq`, `and`, `sql`, `sum`, …) |
| `packages/auth` | `signToken`, `verifyToken`, `hashPassword`, `verifyPassword`, `hashPin`, `verifyPin`, `verifyTelegramInitData` |
| `packages/types` | `LoginPinSchema`, `LoginPasswordSchema`, `LoginTelegramSchema`, `SetPinSchema`, общие типы |
| `packages/ui` | Разделяемые React-компоненты |
| `packages/config` | Базовые tsconfig / eslint конфиги |

---

## Диаграмма компонентов и потоки данных

```
Браузер/PWA (apps/web)
  │  HTTP/REST (NEXT_PUBLIC_API_URL = /api)
  │  SSE (EventSource /api/pos/checks/:id/events, /api/notifications/stream)
  ▼
nginx (titanpos.ru:443)
  ├── /api/* → titan-api:3001
  ├── /wallet/* → titan-wallet:3002
  └── /* → titan-web:3000

titan-api (Hono)
  ├── Модули: auth, pos, shifts, menu, clients, collections, events, customers,
  │           spaces, analytics, supplies, expenses, certificates,
  │           salary, refunds, notifications, ai, system, upload,
  │           staff, cashops, discounts, inventory, platega, pricing,
  │           gomafia, club, tg, internal, superadmin
  ├── packages/database → PostgreSQL 16
  ├── packages/auth (JWT, PIN, passkey)
  ├── Redis (rate-limit, token revocation, SSE Pub/Sub, AI cache)
  └── MinIO (S3-совместимый, /api/upload)

PostgreSQL ← единственный источник истины
  └── все таблицы схемы (миграции 001..053)

Redis
  ├── Pub/Sub: titan:staff-notifications (SSE уведомления)
  │           titan:updates (SSE обновления POS)
  ├── Keys:    pin:fail:*, pwd:fail:* (rate-limit)
  │            revoked:<tokenHash> (отзыв JWT)
  │            sse:<ticket> (одноразовые SSE-тикеты)
  │            titan:pk:reg:* / titan:pk:authn:* (WebAuthn challenge)
  │            ai:<action>:... (кэш AI-ответов, TTL 60 сек)
  └── AOF persistence

apps/wallet → /api/* (те же эндпоинты API, Bearer JWT)
apps/bot-admin → PostgreSQL напрямую (DATABASE_URL)
apps/bot-wallet → PostgreSQL напрямую (DATABASE_URL)

TITAN AI → Polza AI (POLZA_BASE_URL, POLZA_API_KEY, POLZA_MODEL)
Platega → /api/platega/webhook (СБП-платежи)
GoMafia → gomafia.pro API (/api/gomafia/*, поиск/резиденты/стат)
Web Push → browser push service (VAPID)
Telegram → Bot API (ADMIN_BOT_TOKEN, WALLET_BOT_TOKEN, poll_bot_token)
```

### Типичный поток: открытие чека и продажа

```
Кассир (apps/web /pos)
 1. POST /api/pos/checks         → создаёт check (status=open, shiftId=текущая_смена)
 2. POST /api/pos/checks/:id/items  → добавляет check_items; пересчёт total
 3. POST /api/pos/checks/:id/pay    → закрывает чек:
      a. FOR UPDATE блокировка чека
      b. recordMovement(tx, sale) для каждого trackStock-товара
      c. Запись check_payments, check_discounts
      d. Если депозит/бонус — UPDATE profiles.balance / bonusLots
      e. check.status = 'closed'
      f. notify() fire-and-forget
 4. Redis publish titan:updates → SSE → другие вкладки обновляются
```

---

## Фронтенд (apps/web)

### Стек и ключевые библиотеки

- **Next.js 15 App Router** (Server/Client компоненты, `'use client'` везде где нужен React-state)
- **React Query** (`@tanstack/react-query`) — единственный слой кэша и синхронизации серверных данных
- **Zustand** (`store/auth.store`) — глобальное состояние авторизации (JWT, user)
- **framer-motion** — анимации
- **date-fns** — работа с датами
- Стили: инлайн-объекты + CSS-переменные (`--content-narrow`, `--content-wide`), общий дизайн-систем файл `components/manage/DesignSystem.tsx`
- Иконки: собственная SVG-карта, компонент `components/Icon.tsx` (не шрифт и не иконочная библиотека)

### Роутинг (App Router)

```
app/
├── page.tsx               → редирект на /pos
├── login/                 → страница входа (PIN / пароль / passkey)
├── pos/                   → касса (список чеков, карточка чека)
├── events/                → мероприятия
├── dashboard/             → аналитика + FAB TITAN AI
├── ai/                    → экран TITAN AI (page.tsx + TitanAiChat.tsx)
├── manage/
│   ├── layout.tsx         → split-layout на desktop ≥1024px (ManageMenu + контент)
│   ├── page.tsx           → меню управления (мобильный)
│   ├── menu/              → редактор меню
│   ├── inventory/         → склад (Остатки · Поставки · Ревизия — вкладки)
│   ├── pricing/           → Тарифы · Типы вечеров · Аренда=зоны · Мероприятия
│   ├── clients/           → клиенты
│   ├── customers/         → заказчики
│   ├── balances/          → Депозиты и долги (вкладки Все · Депозиты · Долги)
│   ├── loyalty/           → Скидки · Бонусы · Сертификаты (вкладки)
│   ├── collections/       → Сбор средств (Фонд клуба и разовые сборы)
│   ├── staff/             → Пользователи (owner) / Мой профиль (staff) + passkey/уведомления
│   ├── shifts/            → Смена и касса (инкассация встроена)
│   ├── salary/            → зарплаты
│   ├── polls/             → Опросы (Telegram-бот опросов)
│   ├── settings/          → настройки системы
│   └── about/             → о системе (версия, бэкап БД)
├── shifts/                → страница смен (отдельный маршрут, deep-link из уведомлений)
└── tablet/                → планшет-кабинки (выбор зоны, заказы, чат с персоналом)
```

### Навигация

Единый источник правды — `apps/web/src/lib/nav.ts`:

```typescript
// NAV_PRIMARY — четыре основных раздела
export const NAV_PRIMARY = [
  { href: '/pos',       icon: 'point_of_sale', label: 'Касса' },
  { href: '/events',    icon: 'event',         label: 'События' },
  { href: '/dashboard', icon: 'bar_chart',     label: 'Аналитика' },
  { href: '/manage',    icon: 'settings',      label: 'Управление' },
]
```

- **Мобильный**: `components/BottomNav.tsx` — нижняя панель с 4 пунктами
- **Десктоп/планшет**: `components/Sidebar.tsx` — боковая панель + кнопка TITAN AI
- TITAN AI доступен как FAB на `/dashboard` (мобильный) и кнопка в Sidebar (десктоп)

### Split-layout «Управление»

`apps/web/src/app/manage/layout.tsx` — на desktop (≥1024px):

- Слева — `<aside class="manage-split-menu">` с `<ManageMenu />` (ширина CSS-переменная `--manage-menu-w: 420px`, сохраняется в `localStorage('manage-split-w')`)
- Ручка-разделитель `.manage-split-handle` — drag pointer events, диапазон 300–620px
- Справа — `<div class="manage-split-detail">` с анимацией `split-panel-in` при переходе между разделами
- На мобильном оба контейнера `display: contents` — DOM прозрачен, полноэкранный роутинг

### ManageMenu: группы и права

`apps/web/src/components/manage/ManageMenu.tsx`, 4 группы:

```
Меню и склад
  /manage/menu          perm: 'menu'
  /manage/inventory     perm: 'inventory'
  /manage/pricing       (без perm — только роль owner/staff)

Клиенты
  /manage/clients       perm: 'clients'
  /manage/customers
  /manage/balances      perm: 'debtors'
  /manage/loyalty
  /manage/collections   perm: 'debtors'  ← Сбор средств (новый)

Персонал и смены
  /manage/staff         labelStaff: 'Мой профиль' (role-aware подпись)
  /manage/shifts
  /manage/salary        perm: 'salary', только owner

Система
  /manage/settings      только owner
  /manage/polls         только owner
  /manage/about         только owner
```

Гейтинг: пункт скрыт, если `perm` задан И `permissions[perm] === false` у staff. Владельцу права не ограничивают.

### POS: Masonry-сетка и карточка смены

**Компонент `MasonryColumns`** (`apps/web/src/app/pos/page.tsx`) — flex-колонки, раздача элементов по `i % cols`, нечётные колонки смещены вниз на `marginTop: 34px`. Количество колонок определяется по **ширине контейнера** (ResizeObserver на `.pos-cards-grid`), а не по `window.innerWidth` — корректно работает в узкой левой панели сплита:

| Ширина контейнера | Колонок |
|---|---|
| ≥980 px | 4 |
| ≥620 px | 3 |
| ≥280 px | 2 |
| < 280 px | 1 |

**ShiftCard** — предпоследняя ячейка сетки перед «Новый чек». Если смена не открыта — показывает кнопку «Открыть смену». Если открыта и есть чеки — три суммы: открыто чеков / ПРОГНОЗ ВЕЧЕРА (с анимированным лого Tai) / в кассе; тап → `ShiftDetailSheet`.

**Прогноз смены (`/pos/shift-summary`)** — `GET /api/pos/shift-summary` (owner/staff). Вызывает `computeShiftForecast` (`apps/api/src/lib/shiftForecast.ts`): для каждого открытого чека проецирует итог до среднего чека резидента за 120 дней (поправка на день недели при ≥3 семплах). Ответ: `{ shift, openChecks: {count, total}, cashInRegister, forecast: {amount, currentTotal, additional, perCheck[]} }`.

### Страница «Мероприятия» (/events)

- Собственный `PullToRefreshContainer` (глобальный PTR на этом маршруте отключён)
- Сегмент-вкладки **Предстоящие / Прошедшие** (иконка над подписью)
- **Прошедшие**: текущий месяц — плоский список; прошлые месяцы — папки по названию месяца (раскрытие по клику)

### Pull-to-refresh

`components/GlobalPullToRefresh.tsx` — цепляется к `.layout-content`. Срабатывает только при тяге основного контента (игнорирует касания вне контейнера, во вложенных скроллерах и Sheet). Отключён на `/pos`, `/dashboard`, `/login`, `/tablet`, `/events` (последний использует собственный PTR-контейнер).

---

## Бэкенд (apps/api)

### Точка входа и порядок старта

`apps/api/src/index.ts`:

1. `assertEnv()` — fail-fast: `JWT_SECRET` (≥32 символа) и `DATABASE_URL` обязательны; иначе `process.exit(1)`
2. `runMigrations()` — применяет SQL-файлы из `src/migrations/sql/` по порядку
3. `serve({ fetch: app.fetch, port: 3001 })` — Hono HTTP-сервер
4. `scheduleBirthdayCron()` — ежедневно в 09:00 МСК (06:00 UTC) проверяет дни рождения клиентов

### Middleware и безопасность

`apps/api/src/app.ts` — глобальный стек:

```
requestLogger (маскирует ?token= → REDACTED в логах)
secureHeaders()         ← hono/secure-headers
cors({ origin: FRONTEND_URL, credentials: true })
prettyJSON()
bodyLimit(1 МБ)         ← /api/*
rateLimit               ← /api/*   (src/middleware/rateLimit.ts)
```

### Аутентификация (middleware/auth.ts)

`requireAuth` — проверяет JWT из трёх источников (в порядке приоритета):

1. `?ticket=` — одноразовый SSE-тикет (`sse:<uuid>` в Redis, TTL 60 сек, `GETDEL`)
2. `Authorization: Bearer <token>`
3. `?token=<token>` (legacy SSE path)

После верификации JWT (библиотека `jose`, алгоритм HS256) проверяется отзыв токена через Redis-ключ `revoked:<sha256(token)>`. Fail-open при недоступности Redis.

`requireRole(...roles)` — проверяет `user.role` из JWT-payload.

### Модули API (apps/api/src/modules/)

Каждый модуль — отдельный `<name>.router.ts`, подключается в `app.ts`:

| Путь | Модуль | Описание |
|---|---|---|
| `/api/auth` | auth | PIN/пароль/passkey/Telegram вход, logout, SSE-тикет, /me |
| `/api/pos` | pos | Чеки (CRUD, добавление позиций, скидки, оплата, SSE, shift-summary) |
| `/api/shifts` | shifts | Смены (открытие, закрытие, остаток кассы, история, аналитика) |
| `/api/cashops` | cashops | Кассовые операции (внесение/изъятие/зарплата наличными) |
| `/api/menu` | menu | Меню (категории, позиции, модификаторы) |
| `/api/inventory` | inventory | Склад (остатки, ревизии — draft/apply, движения) |
| `/api/supplies` | supplies | Поставки (posted/draft, apply, корректировки) |
| `/api/clients` | clients | Клиенты (CRUD, баланс, статусы/тиры) |
| `/api/collections` | collections | Сбор средств (Фонд клуба и разовые сборы, взносы резидентов) |
| `/api/customers` | customers | Заказчики мероприятий |
| `/api/spaces` | spaces | Зоны (CRUD, soft delete, tablet-link-code) |
| `/api/pricing` | pricing | Тарифы, типы вечеров, почасовые ставки мероприятий |
| `/api/events` | events | Мероприятия (CRM + связь с чеком) |
| `/api/analytics` | analytics | Аналитика (дашборд, отчёты, /events витрина мероприятий) |
| `/api/expenses` | expenses | Расходы |
| `/api/salary` | salary | Выплаты зарплат |
| `/api/refunds` | refunds | Возвраты по чекам |
| `/api/certificates` | certificates | Подарочные сертификаты |
| `/api/discounts` | discounts | Скидки и правила по статусу клиента |
| `/api/notifications` | notifications | Web-push, Telegram-привязка, настройки типов, SSE-стрим |
| `/api/ai` | ai | TITAN AI (POST /chat, POST /action) |
| `/api/system` | system | Настройки (`app_settings`), бэкап БД, секреты интеграций |
| `/api/staff` | staff | Управление персоналом (owner-only), passkeys по staff |
| `/api/upload` | upload | Загрузка изображений в MinIO |
| `/api/platega` | platega | Webhook СБП-платежей (Platega) |
| `/api/gomafia` | gomafia | Интеграция GoMafia.pro (поиск игроков, резиденты клуба) |
| `/api/club` | club | Управление клубом (мультитенантность, control-plane) |
| `/api/tg` | tg | Telegram webhook / чаты |
| `/api/internal` | internal | Внутренние сервисные эндпоинты |
| `/api/superadmin` | superadmin | Суперадмин (управление всеми клубами) |

---

## Модель данных

Схема определена в `packages/database/src/schema/`. Все таблицы создаются и эволюционируют через SQL-миграции (см. раздел «Миграции»). Drizzle ORM используется только для type-safe запросов — DDL не генерируется Drizzle, а ведётся вручную через SQL-файлы.

### profiles (packages/database/src/schema/profiles.ts)

Единая таблица для всех типов «пользователей» системы.

```
profiles
├── id           uuid PK
├── nickname     text UNIQUE NOT NULL
├── fullName     text
├── role         enum('owner','staff','tablet','client')
├── clientTier   text (ссылка на tariffs.key, дефолт 'newbie')
├── balance      numeric(12,2)  ← депозит(>0) / долг(<0) клиента
├── bonusPoints  numeric(12,2)  ← текущий баланс бонусных баллов
├── pin          text (bcrypt hash)
├── passwordHash text (bcrypt hash)
├── tgId         text UNIQUE    ← Telegram user ID
├── tgUsername   text
├── phone        text
├── birthday     text           ← формат 'YYYY-MM-DD'
├── photoUrl     text           ← загружено сотрудником
├── tgPhotoUrl   text           ← из Telegram (миграция 051)
├── permissions  jsonb          ← Record<string,boolean> (права staff)
├── linkedSpaceId uuid          ← для role='tablet': привязанная зона
├── searchTags   text[]
├── isResident   boolean
├── manualVisits integer        ← виртуальные посещения (без кассы)
├── needsPinSetup boolean
├── walletNotifyEnabled boolean ← клиент может отключить уведомления wallet-бота
├── createdAt    timestamptz
└── deletedAt    timestamptz    ← soft delete
```

### tariffs / client_tiers (миграция 052)

Начиная с миграции 052 **статус клиента и тариф объединены**: таблица `tariffs` хранит как тарифы (backing-позиции меню), так и статусы (иерархия: `resident > student > newbie > guest`). Поле `tariffs.key` — слаг статуса; `profiles.clientTier` ссылается на него.

### Таблицы меню и склада (menu.ts)

```
menu_categories: id, name, icon, color, isActive, isTabletVisible, sortOrder
inventory:        id, name, category→menu_categories, price, costPrice (WAC),
                  stockQuantity (кэш: ==SUM(stock_movements.delta)),
                  minThreshold, reorderPoint, parLevel,
                  trackStock, isService, isActive, isTabletVisible,
                  deletedAt (soft delete — FK RESTRICT из check_items)
modifiers:        id, name, price, productId→inventory
tariffs:          id, key, name, price, color, sortOrder, isActive,
                  itemId→inventory (backing-позиция категории «Тарифы»)
```

### Чеки (checks.ts)

```
checks:           id, playerId→profiles, staffId→profiles, shiftId→shifts,
                  status(open/closed/cancelled), totalAmount, paymentMethod,
                  bonusUsed, certificateUsed/certificateId,
                  discountTotal, staffCompId→profiles,
                  spaceId→spaces, spaceStartAt, spaceEndAt,
                  guestNames[], excludedDiscountIds[],
                  linkedEventId, eventBaseAmount, prepaidAmount, tipAmount,
                  plategaTxId (реконсиляция СБП),
                  acquiringSurcharge (миграция 047: эквайринговая надбавка СБП)
check_items:      id, checkId→checks, itemId→inventory, quantity, priceAtTime
check_item_modifiers: id, checkItemId, modifierId, priceAtTime
check_payments:   id, checkId, method(enum), amount
check_discounts:  id, checkId, discountId?, name, type, value, amount, target, itemId?
pending_orders:   id, checkId, spaceId, status, items(jsonb), createdBy, resolvedBy
chat_messages:    id, checkId, spaceId, sender, senderId, text, readAt
```

### Финансы (finance.ts)

```
transactions:    id, type(text: deposit/withdrawal/payment/refund/bonus_accrual/
                            bonus_spend/visit_adjust), amount, description,
                 idempotencyKey (миграция 045), checkId?, playerId?, itemId?

bonus_history:   id, profileId, amount (знаковый), balanceAfter, reason
bonus_lots:      id, profileId, amount, remaining, expiresAt (NULL=бессрочно)
                 ← FIFO-сгорание; profiles.bonusPoints — источник истины баланса

discounts:       id, name, type(percent/fixed), value, isActive, isAuto,
                 minQuantity, itemId?, clientRuleId?, clientId?
client_discount_rules: id, name, clientTier(text), discountId, isActive
certificates:    id, code UNIQUE, nominal, balance, isUsed, createdBy, usedBy

supplies:        id, idempotencyKey, status(posted/draft), draftData(jsonb),
                 note, supplier, totalCost, paymentMethod, createdBy
supply_items:    id, supplyId, itemId?, name, unit, quantity, costPerUnit
supply_corrections: id, supplyId, reason, totalBefore, totalAfter, createdBy

revisions:       id, status(applied/draft), draftData(jsonb), createdBy
revision_items:  id, revisionId, itemId, name, expected, actual, costPrice

stock_movements: id, itemId→inventory, type(text: opening/receipt/sale/return/
                 adjustment/write_off/count/transfer), delta(int), qtyAfter(int),
                 unitCost, sourceType, sourceId, reason, note, createdBy

expenses:        id, idempotencyKey, category(text), amount, description,
                 unitPrice, quantity, expenseDate, eventId?
refunds:         id, checkId, totalAmount, refundType, reason, note,
                 tenders(jsonb [{method,amount}]), restoredItems(jsonb)
salary_payments: id, idempotencyKey, profileId, amount, paymentMethod, note
cash_operations: id, idempotencyKey, type(deposit/withdrawal/salary),
                 amount, description, shiftId, createdBy
analytics_events: id, userId?, event, props(jsonb)
```

### Смены (shifts.ts)

```
shifts:       id, openedBy→profiles, closedBy?, status(open/closed),
              cashStart, cashEnd, eveningType(text→справочник), note,
              openedAt, closedAt
evening_types: key PK, label, color, sortOrder, isSystem
```

### Зоны/пространства (spaces.ts)

```
spaces: id, name, type(text: small_booth/large_booth/hall/table/vr/ps5/zone),
        hourlyRate, capacity, isActive
```

### Мероприятия (events.ts)

```
events:          id, type(titan/exit), title, location, spaceId, date, startTime, endTime,
                 paymentType(fixed/per_head/free), billingMode(amount/hourly),
                 fixedAmount, perHeadAmount, plannedHours, manualAmount,
                 maxGuests, attendeesCount, format(regular/minicap),
                 participationFee, prizeFund, lunchCost, otherCost,
                 status(text: planned/needs_clarification/active/completed/cancelled),
                 responsibleStaffId, checkId, createdBy,
                 customerName, customerPhone
event_participants: id, eventId, profileId, role, prepaid, checkId
event_hourly_rates: hours PK, price (цена за весь период, не за 1 час)
customers:          id, name, phone  ← заказчики (отдельно от profiles)
```

### Сборы взносов (миграция 053)

```
collections:              id, name, description, kind(recurring/oneoff),
                          isMandatory, defaultAmount, isActive, createdBy, createdAt
collection_periods:       id, collectionId→collections, periodKey (YYYY-MM | 'single'),
                          label, amount, status(open/closed), openedAt, closedAt
                          UNIQUE(collectionId, periodKey)
collection_contributions: id, collectionId, periodId, playerId→profiles, amount,
                          method(cash/transfer/sbp/deposit/debt),
                          balanceTxId, note, paidAt, createdBy
                          UNIQUE(periodId, playerId)
collection_members:       id, collectionId, playerId→profiles, amountOverride,
                          excludedUntil, excludedForever, note, createdAt, updatedAt
                          UNIQUE(collectionId, playerId)
```

Метод `deposit`/`debt` — меняет `profiles.balance` и записывает в `transactions`; видно в истории игрока. Методы `cash`/`transfer`/`sbp` — копилка мимо баланса.

### Секреты интеграций (миграция 050)

```
integrations: id, key UNIQUE, valueEnc (AES-256-GCM: v1:<iv>:<tag>:<cipher>),
              updatedAt, updatedBy
```

Управляется через `apps/api/src/lib/secrets.ts` (`encryptSecret` / `decryptSecret` / `maskSecret` / `getClubIntegration`). Мастер-ключ — `SECRETS_MASTER_KEY` (32 байта hex или base64). Разрешённые ключи: `admin_bot_token`, `wallet_bot_token`, `ai_api_key`, `platega_merchant_id`, `platega_secret`, `poll_bot_token`, `gomafia_login`, `gomafia_password`, `gomafia_club_id`. Наружу отдаётся только маска (`••••` + последние 4 символа).

### Уведомления (notifications.ts + passkeys.ts)

```
notifications:           id, type, title, body, meta(jsonb), isRead, userId?
user_notification_settings: id, userId UNIQUE, types(jsonb Record<string,{enabled,telegram?}>)
push_subscriptions:      id, userId, endpoint UNIQUE, p256dh, auth, userAgent
app_settings:            key PK, value  ← настройки системы (app_settings.max_client_debt и др.)
tg_link_requests:        id, profileId, tgId, tgUsername, status(pending/approved/rejected)
passkeys:                id(credential_id base64url), userId→profiles, publicKey,
                         counter, deviceType, backedUp, transports[]
```

---

## Доменные механизмы

### 1. Складской ledger (immutable stock_movements)

**Файл:** `apps/api/src/modules/inventory/ledger.ts`

Принцип: все изменения остатка товара проходят через единую функцию `recordMovement(tx, input)`.
Прямой UPDATE `inventory.stock_quantity` из других модулей — запрещён.

```
recordMovement(tx, input):
  1. SELECT ... FOR UPDATE (строка товара)
  2. before = item.stockQuantity
  3. rawAfter = before + delta
  4. qtyAfter = clamp ? max(0, rawAfter) : rawAfter   // не уходим ниже 0 по умолчанию
  5. applied = qtyAfter - before
  6. WAC (только при type='receipt' и applied > 0):
     avgCost = (before * oldCost + applied * unitCost) / qtyAfter
  7. UPDATE inventory SET stock_quantity = qtyAfter, cost_price = avgCost
  8. INSERT stock_movements (delta=applied, qty_after=qtyAfter, unit_cost=...)
     (нулевую дельту не пишем)
  9. return { qtyAfter, applied, avgCost, ok }
```

**Инвариант (миграция 044):** `inventory.stock_quantity == SUM(stock_movements.delta)` для каждого `item_id`.

**Типы движений:**

| Тип | Когда создаётся |
|---|---|
| `opening` | Первоначальная установка остатка |
| `receipt` | Применение поставки (`POST /api/supplies/:id/apply`) |
| `sale` | Закрытие чека (`POST /api/pos/checks/:id/pay`) |
| `return` | Возврат по чеку (`POST /api/refunds`) |
| `adjustment` | Ручная корректировка остатка |
| `write_off` | Списание |
| `count` | Применение ревизии |
| `transfer` | Перемещение между зонами |

**Опция `requireTracked: true`** (используется в POS): не-учётные товары (`trackStock=false`) пропускаются без записи в журнал.

### 2. Депозиты и долги клиентов

**Авторитетное поле:** `profiles.balance` (`numeric(12,2)`):
- `> 0` — депозит
- `< 0` — долг

**Эндпоинт пополнения/списания:** `POST /api/clients/:id/balance`

```
Атомарная операция (FOR UPDATE):
  1. Читает profiles.balance под блокировкой
  2. Проверяет лимит долга: app_settings.max_client_debt
     (если новый balance < -max_debt → 400)
  3. UPDATE profiles SET balance = balance + amount
  4. INSERT transactions (idempotencyKey — миграция 045)
  5. notifyClient() — Wallet-бот (deposit_topup / debt_created)
```

**Идемпотентность (миграция 045):** уникальный индекс `transactions.idempotency_key` — повтор с тем же ключом возвращает 200 без задвоения.

**Фильтры `GET /api/clients`:**
- `?filter=balances` — все с ненулевым балансом
- `?filter=deposits` — только депозиты (balance > 0)
- `?filter=debtors` — только долги (balance < 0)

### 3. Смены и касса

**Файл:** `apps/api/src/modules/shifts/shifts.service.ts`

```
getShiftCashBalance(shiftId, tx?):
  expected = cashStart
            + SUM(check_payments WHERE method='cash' AND checks.shift_id=shiftId)
            + deposits  (cash_operations WHERE type='deposit')
            − withdrawals (cash_operations WHERE type='withdrawal')
            − salaries  (cash_operations WHERE type='salary')
            − cashRefundTotal  (из refunds: tenders cash или пропорция)
```

**Открытие смены** (`openShift`):
- Проверяет отсутствие открытой смены (уникальный частичный индекс `shifts_one_open`, миграция 032)
- `cashStart` устанавливается = `cashEnd` прошлой смены (непрерывность кассы)
- Расхождение фиксируется как `cashOperation` с обязательной причиной `adjustmentReason`

**Закрытие смены** (`closeShift`):
- Всё в одной транзакции с `FOR UPDATE` строки смены (защита от двойного закрытия и гонки с Platega-webhook)
- Проверяет отсутствие открытых чеков
- Считает `getShiftCashBalance` под блокировкой
- Расхождение → `cashOperation`; notify fire-and-forget

### 4. Прогноз смены (Tai)

**Файл:** `apps/api/src/lib/shiftForecast.ts`, эндпоинт `GET /api/pos/shift-summary`

```
computeShiftForecast(db, shiftId):
  1. Открытые чеки смены + профиль плательщика
  2. История закрытых чеков этих игроков за 120 дней (до 40 чеков на игрока)
  3. Для каждого открытого чека:
       - Если игрок с историей ≥1 чека: avg = среднее (по выбранной выборке)
         Если по дню недели ≥3 семплов → weekday-поправка; иначе — общая средняя
       - projected = max(current, avg)
       - Гость без истории: projected = current (не раздуваем догадками)
  4. amount = SUM(projected), currentTotal = SUM(current)
     additional = amount − currentTotal
```

### 5. Аналитика мероприятий

**Эндпоинт:** `GET /api/analytics/events?from=YYYY-MM-DD&to=YYYY-MM-DD`

Окно — по **календарной дате события** (`events.date`), а не бизнес-дню. Агрегации считаются в JS после единственного SELECT:

- Итого: `count`, `hours`, `days`, `revenue`, `attendees`, `cancelled`, `avgDuration`, `avgCheck`, `revenuePerHour`, `avgAttendees`
- `byStatus` — разбивка по статусу
- `byCategory` — Титан / Выезд / Миникап (по `format` и `type`)
- `byWeekday` — загрузка по дням недели (Пн..Вс)
- `topCustomers` — топ-8 заказчиков по выручке
- `topZones` — топ-6 зон по выручке

### 6. Сбор средств (collections)

**Модуль:** `apps/api/src/modules/collections/collections.router.ts`, таблицы из миграции 053.

Сборы бывают двух видов:
- `recurring` — Фонд клуба: автоматически создаёт период `YYYY-MM` на каждый месяц
- `oneoff` — разовый сбор: единственный период `'single'`

Взнос (`collection_contributions`) записывается на связку `(periodId, playerId)` — один взнос на период. Способы оплаты:
- `cash` / `transfer` / `sbp` — копилка мимо баланса
- `deposit` / `debt` — меняет `profiles.balance` и вставляет в `transactions` (видно в истории игрока)

Исключения резидента (`collection_members`): персональная сумма (`amountOverride`), временное исключение (`excludedUntil`), постоянное исключение (`excludedForever`).

### 7. Черновики поставок и ревизий (миграция 046)

**Поставки:**
- `POST /api/supplies/draft` — сохраняет рабочее состояние в `supplies.draft_data` (status='draft'), остатки не трогает
- `POST /api/supplies/:id/apply` — атомарно: создаёт `supply_items` + вызывает `recordMovement(receipt)` для каждой позиции с `itemId`; status → 'posted'
- `UnsavedGuard` на фронте: предотвращает уход со страницы без сохранения/применения черновика

**Ревизии:**
- `POST /api/inventory/revisions/draft` — сохраняет позиции + введённые факты в `revisions.draft_data` (status='draft')
- `POST /api/inventory/revisions/:id/apply` — для каждой позиции вычисляет дельту (actual − expected → `count` движение), status → 'applied'

### 8. Права сотрудников

`profiles.permissions` — `jsonb` объект `Record<string, boolean>`. Ключи соответствуют разделам меню: `menu`, `inventory`, `clients`, `debtors`, `salary`, и др.

**Выдача прав:** только `role='owner'` через `POST/PATCH /api/staff/:id` (owner-only эндпоинт).

**Фронт (`ManageMenu.tsx`):** пункт навигации скрывается, если у staff `permissions[perm] === false`. Владельца права не ограничивают.

**Дополнительные owner-only операции:** `/api/staff/:id/reset-pin`, `/api/staff/:id/telegram-link`, `/api/staff/:id/passkeys`.

### 9. Аутентификация

**Пакет:** `packages/auth` (JWT через `jose`, PIN/пароль через `bcrypt`)

**Роли:** `owner` / `staff` / `tablet` / `client`

**Способы входа:**

| Способ | Эндпоинт | Описание |
|---|---|---|
| PIN (4 цифры) | `POST /api/auth/login/pin` | Fan-out по staff/owner; rate-limit (5/15мин per IP + глобальный backstop 50 неудач) |
| Пароль | `POST /api/auth/login/password` | Nickname + пароль; rate-limit 5/15мин per IP+ник; авто-апгрейд plaintext → bcrypt |
| Passkey/WebAuthn | `POST /api/auth/passkey/authenticate/options` + `verify` | @simplewebauthn/server; challenge в Redis (TTL 300с) |
| Telegram | `POST /api/auth/login/telegram` | Проверка initData по WALLET_BOT_TOKEN и ADMIN_BOT_TOKEN (оба проверяются) |
| Планшет-кабинка | `POST /api/auth/tablet-session` | PIN сотрудника подтверждает запуск; токен role='tablet' привязан к зоне |
| Планшет по коду | `POST /api/auth/tablet-pair` | 6-значный одноразовый код из Redis (`tablet:pair:<code>` → spaceId, TTL) |

**JWT:** алгоритм HS256, payload `{ sub, role, nickname }`, TTL по умолчанию 7 дней (env `JWT_EXPIRES_IN`). Отзыв — blacklist в Redis до exp.

**SSE-тикет:** `POST /api/auth/sse-ticket` — одноразовый UUID, TTL 60 сек, потребляется при подключении EventSource.

### 10. Уведомления

**Файл:** `apps/api/src/modules/notifications/push.ts`

Единая функция `notify(opts)`:

```
notify({ type, title, body, meta?, userId? }):
  1. Обогащает meta: deep-link url (resolveNotifUrl), groupKey по объекту
  2. Persist в notifications (группировка: обновляет существующую запись
     с тем же groupKey за 12 ч, иначе INSERT) — счётчик мёрджей в meta.count
  3. Redis PUBLISH titan:staff-notifications (SSE всем подписчикам)
  4. Web Push (VAPID): только если VAPID_PUBLIC/PRIVATE/SUBJECT заданы;
     фильтр по userNotificationSettings.types[type].enabled
  5. Telegram (ADMIN_BOT_TOKEN → sendMessage): только если telegram=true в настройках

notifyClient(profileId, text): шлёт через WALLET_BOT_TOKEN (только если
  profiles.wallet_notify_enabled=true и tgId привязан)
```

**Типы уведомлений (22 типа):** `staff_call`, `request_bill`, `client_order`, `chat_message`, `shift_open`, `shift_close`, `cash_discrepancy`, `check_paid`, `large_check`, `low_stock`, `refund`, `birthday`, `check_opened`, `rental_started`, `deposit_topup`, `debt_created`, `certificate_used`, `event_created`, `event_completed`, `new_client`, `supply_received`, `large_refund`.

**SSE-стрим:** `GET /api/notifications/stream?ticket=<uuid>` — Hono SSE (streamSSE), подписывается на Redis Pub/Sub канал `titan:staff-notifications`.

### 11. Лояльность

**Бонусные баллы:**
- `profiles.bonusPoints` — источник истины баланса
- `bonus_lots` — FIFO-трекинг сгорания: поле `remaining` уменьшается при списании; `expiresAt = NULL` → бессрочно
- `bonus_history` — аудит начислений и списаний (знаковый amount: + начисление, − списание)
- Начисление: `accrueBonusLot()` (`apps/api/src/lib/bonusLots.ts`)
- Списание: `spendBonusLots()` (FIFO по `expiresAt ASC NULLS LAST`)

**Скидки:**
- `discounts` — справочник скидок (тип: процент/фиксированная, ручная/автоматическая)
- `client_discount_rules` — привязка скидки к статусу клиента (clientTier)
- `check_discounts` — материализованные скидки на чек

**Сертификаты:**
- `certificates` — уникальный `code`, `nominal`, `balance` (частичное погашение)

**Статусы клиентов (миграция 052):**
- Унифицированы с тарифами через таблицу `tariffs` (поле `key`)
- Иерархия: `resident > student > newbie > guest`
- Базовый статус: `newbie` (isSystem=true)

### 12. Тарифы и аренда зон

**Тарифы** (`tariffs`): каждый тариф привязан к скрытой backing-позиции меню (`itemId → inventory`, категория «Тарифы», `isService=true`, `trackStock=false`). Через эту позицию тариф попадает в `check_items` стандартным путём — денежный маршрут унифицирован.

**Зоны** (`spaces`): типы `small_booth`, `large_booth`, `hall`, `table`, `vr`, `ps5`, `zone`. Soft delete через `isActive=false`. Планшет привязывается к зоне через `linkedSpaceId`.

**Аренда зоны в чеке:** `checks.spaceStartAt/spaceEndAt` → расчёт стоимости `computeRental()` (`apps/api/src/lib/money.ts`).

**Запрет двух одновременных аренд одной зоны (миграция 048):** уникальный частичный индекс на уровне БД.

### 13. TITAN AI (Tai)

**Файл:** `apps/api/src/modules/ai/ai.router.ts`

**Эндпоинты:** `POST /api/ai/chat`, `POST /api/ai/action` (одинаковый обработчик `handleChat`)

**Провайдер:** Polza AI (`POLZA_BASE_URL` / `POLZA_API_KEY` / `POLZA_MODEL`, дефолт `google/gemini-3.1-flash-lite`). Запросы через `fetch` к `${POLZA_BASE}/chat/completions` (OpenAI-совместимый формат).

**Действия (action):** `revenue_summary`, `daily_summary`, `shift_report`, `product_analysis`, `client_analysis`, `expense_analysis`, `low_stock_alert`, `popular_hours`, `avg_check_trend`, `refund_analysis`, `salary_report`, `event_summary`, `certificate_usage`, `bonus_usage`, `custom_query`

**Конвейер `custom_query` (text-to-SQL):**
```
1. getSchemaDoc()         ← information_schema, кэш 5 мин; исключает
                            _migrations, push_subscriptions, чувствительные колонки
2. callAI(SQLGEN_PROMPT, "СХЕМА + ВОПРОС") → raw SQL
3. sanitizeSql(raw)       ← только SELECT/WITH; запрещает DDL/DML/INSERT/чувствительные поля
4. runReadonly(clean)     ← db.transaction + SET READ ONLY + statement_timeout 5000ms + LIMIT 200
5. Формирует блок "РЕЗУЛЬТАТ (N строк): <json>"
6. callAI(SYSTEM_PROMPT, контекст+результат) → финальный ответ
```

**Кэш:** Redis, ключ `ai:<action>:<payload>:<question>`, TTL 60 секунд.

**Доступ:** `requireAuth + requireRole('owner', 'staff')`. Клиенты и планшеты не имеют доступа.

**Фронт:** `apps/web/src/app/ai/page.tsx` + `TitanAiChat.tsx`. Кнопки быстрых действий соответствуют 15 action-типам. Composer прикреплён снизу; сообщения скроллятся внутри flex-контейнера.

### 14. Интеграция GoMafia

**Модуль:** `apps/api/src/modules/gomafia/gomafia.router.ts`

Подбор игроков при создании клиента. Учётные данные клуба (`gomafia_login`, `gomafia_password`, `gomafia_club_id`) хранятся в таблице `integrations` зашифрованно; фолбэк — env-переменные `GOMAFIA_LOGIN` / `GOMAFIA_PASSWORD`.

**Эндпоинты:**
- `GET /api/gomafia/status` — проверка подключения и данные клуба
- `POST /api/gomafia/connect` — логин в GoMafia (сохраняет `gomafia_club_id`)
- `POST /api/gomafia/set-club` — установка клуба по ссылке `gomafia.pro/club/N`
- `DELETE /api/gomafia/disconnect` — удаление credentials (owner-only)
- `GET /api/gomafia/search?q=` — поиск игроков (объединяет резидентов клуба + глобальный getTop)
- `GET /api/gomafia/club/residents` — список резидентов клуба
- `GET /api/gomafia/player/:id` — детали игрока по GoMafia ID

### 15. Планшет-кабинки

Планшет — роль `tablet` в `profiles` с `linkedSpaceId`. Его JWT выдаётся на 30 дней.

Возможности из планшета:
- Просмотр меню (только `isTabletVisible=true` позиции)
- `POST /api/pos/checks/*/pending-orders` — создание заказа (pending → confirmed/rejected персоналом)
- Чат с персоналом (`chat_messages`)
- Вызов персонала (`staff_call`), запрос счёта (`request_bill`)

---

## Миграции

**Файлы:** `apps/api/src/migrations/sql/*.sql` (001..053)
**Раннер:** `apps/api/src/migrations/runner.ts`

### Алгоритм раннера

```typescript
runMigrations():
  1. CREATE TABLE IF NOT EXISTS _migrations (id text PK, applied_at timestamptz)
  2. readdir('./sql/') → отсортированный список .sql файлов
  3. SELECT id FROM _migrations → Set уже применённых
  4. Для каждого нового файла:
       db.transaction(async tx => {
         tx.execute(sql.raw(fileContent))  // сам SQL (может быть многострочным)
         tx.insert(_migrations).values({ id: fileName })
       })
```

Каждая миграция применяется атомарно (транзакция). Ошибка в файле N → откат N, файлы 1..(N-1) уже применены. При следующем старте раннер повторно попробует N.

### Ключевые миграции

| Файл | Что делает |
|---|---|
| `001–012` | Начальная схема: события, индексы, зоны, bonus_lots |
| `013_bonus_lots.sql` | Таблица bonus_lots (FIFO сгорание) |
| `021_*` | client_tier: enum → text (динамические статусы) |
| `025_*` | evening_types: enum → справочник |
| `028_check_tip_amount.sql` | Чаевые по СБП (checks.tip_amount) |
| `029_pending_orders.sql` | Заказы с планшета (pending_orders) |
| `030_chat_messages.sql` | Чат гость–персонал (chat_messages) |
| `032_one_open_shift.sql` | Уникальный частичный индекс на открытую смену |
| `033_platega_tx_id.sql` | Реконсиляция СБП (checks.platega_tx_id) |
| `035_supply_corrections.sql` | Аудит правок поставок (supply_corrections) |
| `039_expense_items.sql` | unit_price/quantity в расходах |
| `041_manual_visits.sql` | Виртуальные посещения (profiles.manual_visits) |
| `043_revisions.sql` | История ревизий (revisions, revision_items) |
| `044_stock_ledger.sql` | Immutable stock_movements ledger + WAC + инвариант |
| `045_tx_idempotency.sql` | Идемпотентность транзакций (transactions.idempotency_key) |
| `046_drafts.sql` | Черновики поставок и ревизий (status+draft_data) |
| `047_acquiring_surcharge.sql` | Эквайринговая надбавка СБП (checks.acquiring_surcharge) |
| `048_one_open_rental_per_space.sql` | Запрет двух аренд одной зоны одновременно |
| `049_fk_perf_indexes.sql` | Индексы на FK/горячих фильтрах (аудит H4) |
| `050_integrations.sql` | Зашифрованное хранилище секретов (integrations, AES-256-GCM) |
| `051_client_photo_sources.sql` | Раздельные поля photoUrl / tgPhotoUrl |
| `052_status_tariff_unify.sql` | Объединение статусов клиента и тарифов (tariffs.key) |
| `053_collections.sql` | Сборы взносов резидентов (collections + 3 таблицы) |

---

## Деплой (docker compose)

**VPS:** `/opt/titan-hub`, деплой через `scripts/deploy.sh`.

```
deploy.sh:
  1. git fetch + reset origin/main
  2. pnpm install (монорепо)
  3. docker compose build (все сервисы)
  4. scripts/backup-db.sh (pg_dump перед миграциями)
  5. docker compose up -d (поднимает контейнеры; api применяет миграции при старте)
  6. nginx -s reload
  7. curl https://titanpos.ru/api/health → проверка
```

**Сервисы docker-compose:**

| Сервис | Образ / Dockerfile | Порт | Лимит RAM |
|---|---|---|---|
| postgres | postgres:16-alpine | (внутренний) | 768 МБ |
| redis | redis:7-alpine | (внутренний) | 256 МБ |
| minio | minio/minio:2023-06-29 | (внутренний) | 512 МБ |
| api | apps/api/Dockerfile | 3001 | 768 МБ |
| web | apps/web/Dockerfile | 3000 | 768 МБ |
| wallet | apps/wallet/Dockerfile | 3002 | 512 МБ |
| bot-admin | apps/bot-admin/Dockerfile | — | 256 МБ |
| bot-wallet | apps/bot-wallet/Dockerfile | — | 256 МБ |
| nginx | nginx:alpine | 80, 443 | 128 МБ |

**Зависимости старта:** `nginx` стартует только когда `api` здоров (прошёл healthcheck с миграциями), `web` и `wallet` готовы. `api` ждёт `postgres` и `redis`.

**Redis persistence:** AOF (`--appendonly yes`) — переживает краш без потери rate-limit и blacklist состояния.

**Healthcheck api:** `node -e "fetch('http://localhost:3001/health').then(r=>process.exit(r.ok?0:1))"`, start_period 45 сек (достаточно для миграций).

**SSE и токены в URL:** nginx маскирует чувствительные query-параметры; API-логгер маскирует `?token=`, `?ticket=` → `REDACTED`. Новые SSE-подключения используют `?ticket=` (одноразовый, 60 сек) вместо полного JWT в URL.
