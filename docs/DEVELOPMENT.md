<!-- generated-by: gsd-doc-writer -->
# Руководство разработчика Titan HUB

## Содержание

1. [Локальный запуск](#локальный-запуск)
2. [Команды монорепо](#команды-монорепо)
3. [Структура кода](#структура-кода)
4. [Как добавить новый API-эндпоинт / Hono-модуль](#как-добавить-новый-api-эндпоинт--hono-модуль)
5. [Как добавить миграцию и новую таблицу](#как-добавить-миграцию-и-новую-таблицу)
6. [Как добавить новый экран / вкладку на фронте](#как-добавить-новый-экран--вкладку-на-фронте)
7. [Как добавить пункт меню «Управление»](#как-добавить-пункт-меню-управление)
8. [Как добавить новую интеграцию](#как-добавить-новую-интеграцию)
9. [Ключевые паттерны проекта](#ключевые-паттерны-проекта)
10. [Дизайн-система и UI-компоненты](#дизайн-система-и-ui-компоненты)
11. [Иконки](#иконки)
12. [Конвенции](#конвенции)

---

## Локальный запуск

**Требования:** Node.js ≥ 22, pnpm ≥ 11 (см. `package.json` `engines`).

```bash
git clone <repo-url>
cd titan-hub
pnpm install
```

Скопируйте `.env.example` → `.env` в пакетах `apps/api` и `apps/web` и заполните
обязательные переменные (см. `docs/CONFIGURATION.md`).

```bash
# Запуск всех приложений в режиме разработки (turbo dev)
pnpm dev
```

`apps/api` стартует на порту `API_PORT` (по умолчанию 3001), `apps/web` на порту 3000,
`apps/wallet` на порту 3002.

---

## Команды монорепо

Монорепо построено на **pnpm workspaces** + **Turborepo**. Корневой `package.json`
содержит скрипты-обёртки, которые запускают задачи Turbo по всем пакетам с учётом
зависимостей (`"dependsOn": ["^build"]`).

### Глобальные команды (запускаются из корня)

| Команда | Что делает |
|---|---|
| `pnpm dev` | `turbo run dev` — параллельный watch-запуск всех приложений (persistent, без кэша) |
| `pnpm build` | `turbo run build` — сборка всех пакетов в топологическом порядке |
| `pnpm type-check` | `turbo run type-check` — `tsc --noEmit` по всем пакетам |
| `pnpm lint` | `turbo run lint` — ESLint по всем пакетам |
| `pnpm format` | `prettier --write "**/*.{ts,tsx,js,jsx,json,md,css}"` — форматирование кода |
| `pnpm clean` | `turbo run clean` + `rm -rf node_modules` — удалить все артефакты |
| `pnpm build:wallet` | `turbo run build --filter=@titan/wallet` — сборка только кошелька |
| `pnpm db:generate` | `drizzle-kit generate` в пакете `@titan/database` |
| `pnpm db:migrate` | `drizzle-kit migrate` в пакете `@titan/database` |
| `pnpm db:studio` | `drizzle-kit studio` — веб-интерфейс просмотра БД |

### Фильтрованный запуск отдельных пакетов

Флаг `--filter` позволяет работать только с нужным пакетом:

```bash
# Запустить только API в watch-режиме
pnpm --filter @titan/api dev

# Собрать только веб-приложение
pnpm --filter @titan/web build

# Проверить типы только в database-пакете
pnpm --filter @titan/database type-check

# Запустить dev для API и database одновременно
pnpm --filter @titan/api --filter @titan/database dev
```

Идентификаторы пакетов (`name` в `package.json`):

| Путь | Имя пакета |
|---|---|
| `apps/api` | `@titan/api` |
| `apps/web` | `@titan/web` |
| `apps/wallet` | `@titan/wallet` |
| `apps/bot-admin` | `@titan/bot-admin` |
| `apps/bot-wallet` | `@titan/bot-wallet` |
| `packages/database` | `@titan/database` |
| `packages/auth` | `@titan/auth` |
| `packages/types` | `@titan/types` |
| `packages/config` | `@titan/config` |
| `packages/ui` | `@titan/ui` |

### Скрипты внутри пакетов

**`apps/api`:**

| Команда | Что делает |
|---|---|
| `pnpm dev` | `tsx watch src/index.ts` — горячая перезагрузка через tsx |
| `pnpm build` | `tsc` + копирование SQL-файлов миграций в `dist/migrations/sql/` |
| `pnpm start` | `node dist/index.js` — production-запуск из собранного dist |
| `pnpm type-check` | `tsc --noEmit` |

**`apps/web`:**

| Команда | Что делает |
|---|---|
| `pnpm dev` | `next dev --turbopack` — Next.js dev-сервер с Turbopack |
| `pnpm build` | `next build` — production-сборка (standalone) |
| `pnpm start` | `next start -p 3000` |
| `pnpm lint` | `next lint` |
| `pnpm type-check` | `tsc --noEmit` |

**`packages/database`:**

| Команда | Что делает |
|---|---|
| `pnpm dev` | `tsc --watch` |
| `pnpm build` | `tsc` |
| `pnpm db:generate` | `drizzle-kit generate` — создать `.drizzle/` миграции из схемы |
| `pnpm db:push` | `drizzle-kit push` — прямая синхронизация схемы с БД (только для dev) |
| `pnpm db:studio` | Drizzle Studio на локальной БД |

---

## Структура кода

### `apps/api` — бэкенд (Hono)

```
apps/api/src/
├── index.ts                  # Точка входа: assertEnv → runMigrations → serve + birthday cron
├── app.ts                    # Hono app: middleware (cors, secureHeaders, rateLimit, logger),
│                             #   монтирование всех роутеров на /api/*
├── types.ts                  # AppEnv = { Variables: { user: JwtPayload } }
├── middleware/
│   ├── auth.ts               # requireAuth (Bearer / SSE-ticket), requireRole(...roles)
│   └── rateLimit.ts
├── lib/
│   ├── money.ts              # round2, computeTotals, computeRental — денежная математика
│   ├── redis.ts              # getSharedRedis() — ioredis singleton
│   └── dateFmt.ts            # fmtMsk, bizDayStr, bizDayStart, bizMonthStart
├── cron/
│   └── birthdays.ts          # checkBirthdays() — ежедневный cron 09:00 МСК
├── migrations/
│   ├── runner.ts             # runMigrations() — применяет SQL-файлы на старте
│   └── sql/                  # 001_*.sql … 053_collections.sql (нумерация сквозная)
└── modules/
    ├── ai/           ai.router.ts
    ├── analytics/    analytics.router.ts
    ├── auth/         auth.router.ts
    ├── cashops/      cashops.router.ts
    ├── certificates/ certificates.router.ts
    ├── clients/      clients.router.ts
    ├── club/         club.router.ts
    ├── collections/  collections.router.ts
    ├── customers/    customers.router.ts
    ├── discounts/    discounts.router.ts
    ├── events/       events.router.ts
    ├── expenses/     expenses.router.ts
    ├── gomafia/      gomafia.router.ts
    ├── internal/     internal.router.ts
    ├── inventory/    inventory.router.ts  ← + ledger.ts (recordMovement)
    ├── menu/         menu.router.ts
    ├── notifications/notifications.router.ts
    ├── platega/      platega.router.ts
    ├── pos/          pos.router.ts
    ├── pricing/      pricing.router.ts
    ├── refunds/      refunds.router.ts
    ├── salary/       salary.router.ts
    ├── shifts/       shifts.router.ts  ← + shifts.service.ts (getShiftCashBalance)
    ├── spaces/       spaces.router.ts
    ├── staff/        staff.router.ts
    ├── superadmin/   index.ts
    ├── supplies/     supplies.router.ts
    ├── system/       system.router.ts  ← интеграции (INTEGRATION_KEYS)
    ├── tg/           tg.router.ts
    └── upload/       upload.router.ts
```

Каждый модуль монтируется в `app.ts`:

```typescript
app.route('/api/inventory', inventoryRouter)
```

### `apps/web` — фронтенд (Next.js App Router)

```
apps/web/src/
├── app/
│   ├── layout.tsx            # Корневой layout: Providers, AuthGuard, Sidebar,
│   │                         #   BottomNav, GlobalPullToRefresh, SessionLock
│   ├── providers.tsx         # QueryClient (staleTime 2 мин, gcTime 30 мин),
│   │                         #   ToastProvider, NotificationsProvider
│   ├── page.tsx              # Редирект на /pos
│   ├── login/                # Страница входа (PIN, passkey, пароль)
│   ├── pos/                  # POS-касса
│   ├── events/               # События/мероприятия
│   ├── dashboard/            # Аналитика
│   ├── ai/                   # Tai AI (TitanAiChat.tsx)
│   ├── shifts/               # Смены (legacy-роут, основной теперь /manage/shifts)
│   └── manage/
│       ├── layout.tsx        # Split-layout: слева ManageMenu, справа content (≥1024px)
│       ├── page.tsx          # /manage — корень (мобильный список разделов)
│       ├── menu/             # Меню заведения
│       ├── inventory/        # Склад: Остатки · Поставки · Ревизия (вкладки)
│       ├── pricing/          # Тарифы и аренда
│       ├── clients/          # Клиенты
│       ├── customers/        # Заказчики
│       ├── balances/         # Депозиты и долги
│       ├── loyalty/          # Лояльность (Скидки · Бонусы · Сертификаты)
│       ├── collections/      # Сбор средств (Фонд клуба / разовые сборы)
│       ├── staff/            # Пользователи (owner) / Мой профиль (staff)
│       ├── shifts/           # Смены и касса (split-layout)
│       ├── salary/           # Зарплата
│       ├── polls/            # Опросы явки
│       ├── settings/         # Настройки системы + IntegrationsTab
│       └── about/            # О системе
├── components/
│   ├── manage/
│   │   ├── DesignSystem.tsx  # INP, SEL, LBL, Toggle, Sheet, PageHeader, Button,
│   │   │                     #   IconButton, ConfirmDialog, SaveButton, formatMoney,
│   │   │                     #   SectionGroup, FormField, ToggleRow, StatChip, Chip
│   │   ├── ManageMenu.tsx    # Навигационное меню «Управления» (4 группы, role/perm гейт)
│   │   └── UnsavedGuard.tsx  # Контекст защиты несохранённых черновиков
│   ├── Icon.tsx              # Компонент иконки (собственная SVG-карта, ~1200 строк)
│   ├── BottomNav.tsx         # Нижняя навигация (мобильная)
│   ├── Sidebar.tsx           # Боковая панель (десктоп/планшет)
│   ├── GlobalPullToRefresh.tsx
│   ├── Toast.tsx             # useToast() → show(message, type, duration?)
│   ├── AuthGuard.tsx
│   ├── SessionLock.tsx       # Блокировка по бездействию (30 мин)
│   └── ServiceWorkerRegister.tsx
├── store/
│   └── auth.store.ts         # Zustand: token, user, isLocked, setAuth, logout, lock/unlock
├── hooks/
│   ├── useShift.ts
│   └── useCountUp.ts
└── lib/
    ├── api.ts                # api.get/post/put/patch/delete — fetch + auth-header + 401-logout
    ├── nav.ts                # NAV_PRIMARY, NAV_SHIFTS, isNavActive
    ├── haptic.ts
    ├── push.ts
    └── sse.ts
```

### `packages/database` — Drizzle ORM

```
packages/database/src/
├── client.ts           # drizzle(postgres(DATABASE_URL), { schema }) → db
├── index.ts            # реэкспорт db, операторов drizzle-orm, всей схемы
└── schema/
    ├── index.ts        # реэкспорт всех файлов схемы
    ├── profiles.ts     # profiles (пользователи/клиенты), clientTiers, bonusHistory
    ├── menu.ts         # menuCategories, inventory, modifiers
    ├── checks.ts       # checks, checkItems, checkPayments, checkDiscounts
    ├── finance.ts      # transactions, supplies, supplyItems, supplyCorrections,
    │                   #   stockMovements, revisions, revisionItems, salaryPayments,
    │                   #   cashOperations, expenses, refunds, bonusLots, certificates, discounts
    ├── spaces.ts       # spaces
    ├── shifts.ts       # shifts
    ├── events.ts       # events, eveningTypes, eventHourlyRates
    ├── customers.ts    # customers (заказчики)
    ├── notifications.ts# userNotificationSettings, pushSubscriptions, tgLinkRequests
    └── passkeys.ts     # passkeys (WebAuthn)
```

Импорт в коде API:

```typescript
import { db, inventory, stockMovements, eq, asc, sql } from '@titan/database'
```

### `packages/auth` — JWT и хэши

```
packages/auth/src/
├── index.ts      # реэкспорт всего
├── jwt.ts        # signToken(payload), verifyToken(token) → JwtPayload
├── password.ts   # hashPassword, verifyPassword (bcryptjs)
├── pin.ts        # hashPin, verifyPin
└── telegram.ts   # verifyTelegramInitData
```

---

## Как добавить новый API-эндпоинт / Hono-модуль

### Шаг 1. Создать файл роутера

Создайте `apps/api/src/modules/<name>/<name>.router.ts`:

```typescript
import type { AppEnv } from '../../types.js'
import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { db, someTable, eq } from '@titan/database'
import { requireAuth, requireRole } from '../../middleware/auth.js'

export const myRouter = new Hono<AppEnv>()

// ВАЖНО: requireAuth всегда ставьте ДО requireRole — иначе 500 вместо 401.
myRouter.use('*', requireAuth, requireRole('owner', 'staff'))

// GET /api/my-route
myRouter.get('/', async (c) => {
  const rows = await db.select().from(someTable)
  return c.json({ items: rows })
})

// POST /api/my-route
const CreateSchema = z.object({
  name: z.string().min(1),
})

myRouter.post('/', zValidator('json', CreateSchema), async (c) => {
  const body = c.req.valid('json')
  const user = c.get('user') // JwtPayload: { id, role, nickname }
  const [row] = await db.insert(someTable).values({ ...body }).returning()
  return c.json({ item: row }, 201)
})
```

Типы ролей: `'owner'`, `'staff'`, `'tablet'`, `'client'`. Эндпоинты без `requireAuth`
доступны публично (например, GET /menu/categories для планшета-киоска).

### Шаг 2. Подключить в `app.ts`

```typescript
// apps/api/src/app.ts
import { myRouter } from './modules/my-module/my-module.router.js'
// ...
app.route('/api/my-route', myRouter)
```

### Шаг 3. Валидация через Zod

Используйте `zValidator('json', Schema)` от `@hono/zod-validator` — он автоматически
возвращает 400 с описанием ошибки при провале валидации.

### Шаг 4. Атомарные операции

Для мутаций, затрагивающих несколько таблиц, оборачивайте в транзакцию:

```typescript
import { db } from '@titan/database'

await db.transaction(async (tx) => {
  // все операции внутри tx
})
```

---

## Как добавить миграцию и новую таблицу

### Принцип работы раннера

`apps/api/src/migrations/runner.ts` — кастомный SQL-раннер. При каждом старте API:

1. Создаёт таблицу `_migrations` если её нет.
2. Читает все `*.sql` из `apps/api/src/migrations/sql/` в алфавитном порядке.
3. Применяет только те файлы, которых ещё нет в `_migrations`.
4. Каждая миграция выполняется в транзакции — при ошибке откатывается, сервер не стартует.

Текущая последняя миграция: `053_collections.sql`. Следующий номер — `054`.

### Шаг 1. Создать SQL-файл

```bash
# Имя файла: NNN_описание.sql
touch apps/api/src/migrations/sql/054_my_feature.sql
```

SQL должен быть идемпотентным (`IF NOT EXISTS` для таблиц и колонок):

```sql
-- apps/api/src/migrations/sql/054_my_feature.sql
ALTER TABLE some_table ADD COLUMN IF NOT EXISTS new_col text;
CREATE INDEX IF NOT EXISTS idx_some_table_new_col ON some_table(new_col);
```

Нумерация трёхзначная, сквозная (`054`, `055`, …). Пробелы в нумерации не допускаются —
раннер читает файлы в алфавитном порядке.

### Шаг 2. Обновить Drizzle-схему

Добавьте/измените определение таблицы в нужном файле `packages/database/src/schema/*.ts`:

```typescript
// packages/database/src/schema/finance.ts
import { pgTable, text, uuid, timestamp, integer } from 'drizzle-orm/pg-core'

export const myNewTable = pgTable('my_new_table', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
})
```

Реэкспортируйте из `packages/database/src/schema/index.ts`:

```typescript
export * from './my-new-table.js' // добавить строку
```

После этого таблица доступна в любом модуле API через:

```typescript
import { db, myNewTable } from '@titan/database'
```

### Шаг 3. Пересобрать database-пакет

```bash
pnpm --filter @titan/database build
```

Это необходимо, так как `apps/api` импортирует из скомпилированного `dist/`.

### Важно

- **Не используйте** `drizzle-kit push` на production — только кастомный SQL-раннер.
- `drizzle-kit generate` / `db:push` допустимы только в локальной разработке для
  быстрой итерации со схемой. В prod миграции применяются раннером на старте api-контейнера.

---

## Как добавить новый экран / вкладку на фронте

### Новый раздел в `/manage`

1. Создайте директорию `apps/web/src/app/manage/<name>/`.
2. Создайте `page.tsx` с директивой `'use client'` (все manage-страницы клиентские):

```typescript
// apps/web/src/app/manage/my-section/page.tsx
'use client'
import React, { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { PageHeader, Button, Sheet, INP, LBL } from '@/components/manage/DesignSystem'
import { useToast } from '@/components/Toast'

export default function MySectionPage() {
  const qc = useQueryClient()
  const { show } = useToast()

  const { data, isLoading } = useQuery({
    queryKey: ['my-section'],
    queryFn: () => api.get<{ items: any[] }>('/my-route'),
  })

  const create = useMutation({
    mutationFn: (body: any) => api.post('/my-route', body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['my-section'] })
      show('Создано', 'success')
    },
    onError: () => show('Ошибка', 'error'),
  })

  return (
    <div style={{ padding: '0 0 24px' }}>
      <PageHeader title="Мой раздел" />
      {/* контент */}
    </div>
  )
}
```

### Новые вкладки внутри существующего экрана

Используйте URL-параметр `?tab=name` как хранилище состояния вкладки (паттерн из
`/manage/inventory`, `/manage/loyalty`, `/manage/balances`):

```typescript
const searchParams = useSearchParams()
const tab = searchParams.get('tab') ?? 'default'
const router = useRouter()
const setTab = (t: string) => router.replace(`?tab=${t}`, { scroll: false })
```

### React Query: ключи и инвалидация

Единого файла с ключами нет — ключи определяются inline рядом с запросом.
Соглашения по именованию, сложившиеся в проекте:

| Данные | queryKey |
|---|---|
| Список товаров меню (все) | `['menu', 'items', 'all']` |
| Список товаров инвентаря | `['menu-items-inventory']` |
| Обзор склада (KPI) | `['inventory-overview']` |
| Движения конкретного товара | `['inventory-movements', itemId]` |
| Список ревизий | `['revisions']` |
| Конкретная ревизия | `['revisions', id]` |
| Список клиентов | `['clients']` |
| Транзакции клиента | `['clients', clientId, 'tx']` |
| Посещения клиента | `['clients', clientId, 'visit']` |
| Зоны | `['spaces']` |
| Категории меню | `['menu', 'categories']` |
| Интеграции | `['integrations']` |
| Статус GoMafia | `['gomafia-status']` |

После мутации инвалидируйте связанные ключи через `qc.invalidateQueries`:

```typescript
const qc = useQueryClient()
// после создания/изменения товара:
qc.invalidateQueries({ queryKey: ['menu-items-inventory'] })
qc.invalidateQueries({ queryKey: ['inventory-overview'] })
```

---

## Как добавить пункт меню «Управление»

Меню определено в `apps/web/src/components/manage/ManageMenu.tsx` в константе `NAV`
(массив групп `NavGroup[]`).

### Структура группы и пункта

```typescript
{
  title: 'Название группы',
  icon: 'icon_name',
  items: [
    {
      href: '/manage/my-section',
      label: 'Мой раздел',
      labelStaff: 'Мой раздел (staff)',  // опционально: другая подпись для роли staff
      icon: 'icon_name',                  // из Icon.tsx SVG-карты
      color: '#8B5CF6',                   // акцентный цвет иконки и hover-подсветки
      bg: 'rgba(139,92,246,0.15)',        // фон иконки
      roles: ['owner', 'staff'],          // кому виден пункт
      perm: 'my_perm_key',               // опционально: ключ из profiles.permissions
    },
  ],
}
```

### Четыре существующие группы

1. **Меню и склад** — `/manage/menu`, `/manage/inventory`, `/manage/pricing`
2. **Клиенты** — `/manage/clients`, `/manage/customers`, `/manage/balances`, `/manage/loyalty`, `/manage/collections`
3. **Персонал и смены** — `/manage/staff`, `/manage/shifts`, `/manage/salary`
4. **Система** — `/manage/settings`, `/manage/polls`, `/manage/about`

Добавьте пункт в существующую группу или создайте новую группу в массиве `NAV`.

### Права доступа (`perm`)

Поле `perm` ссылается на ключ в `profiles.permissions` (jsonb `Record<string,boolean>`).
Если `perm` задан, пункт скрывается для роли `staff` при `permissions[perm] === false`.
Владельца (`role === 'owner'`) права не ограничивают.

Существующие ключи прав (определены в `apps/web/src/app/manage/staff/page.tsx`):

| Ключ | По умолчанию для staff | Описание |
|---|---|---|
| `menu` | true | Меню |
| `inventory` | true | Инвентарь |
| `supplies` | true | Снабжение |
| `clients` | true | Клиенты |
| `discounts` | true | Скидки (лояльность) |
| `bonus` | true | Бонусы (лояльность) |
| `expenses` | false | Расходы (аналитика) |
| `debtors` | false | Депозиты и долги (+ «Сбор средств» использует тот же ключ) |
| `staff` | false | Персонал |
| `salary` | false | Зарплата |
| `about` | true | О заведении |

Чтобы добавить новое право: добавьте ключ в `DEFAULT_PERMISSIONS` и `PERMISSION_LABELS`
в `apps/web/src/app/manage/staff/page.tsx`, и укажите `perm: 'new_key'` в пункте меню.

---

## Как добавить новую интеграцию

Интеграции — шифрованное хранилище ключей/токенов сторонних сервисов. Система состоит
из двух частей: каталог на фронте (`IntegrationsTab.tsx`) и белый список ключей на
бэкенде (`system.router.ts → INTEGRATION_KEYS`).

### Шаг 1. Добавить ключи в белый список на бэкенде

Откройте `apps/api/src/modules/system/system.router.ts` и добавьте ключи в объект
`INTEGRATION_KEYS`:

```typescript
const INTEGRATION_KEYS: Record<string, string> = {
  // ... существующие ключи ...
  my_service_token: 'MyService: токен API',  // добавить
}
```

Ключи строго из белого списка — любое значение `key` вне списка вернёт 400 (защита от
записи произвольных данных в таблицу).

**Текущие зарегистрированные ключи:**

| Ключ | Описание |
|---|---|
| `admin_bot_token` | Токен админ-бота Telegram |
| `wallet_bot_token` | Токен бота-кошелька Telegram |
| `ai_api_key` | API-ключ TITAN AI (Polza.ai) |
| `platega_merchant_id` | Platega: Merchant ID |
| `platega_secret` | Platega: секретный ключ |
| `poll_bot_token` | Токен бота опросов Telegram |

### Шаг 2. Добавить интеграцию в каталог фронта

Откройте `apps/web/src/app/manage/settings/IntegrationsTab.tsx` и добавьте объект в
массив `CATALOG`:

```typescript
const CATALOG: Product[] = [
  // ... существующие интеграции ...
  {
    id: 'my_service',
    name: 'MyService',
    icon: 'icon_name',      // из Icon.tsx
    color: '#F59E0B',
    blurb: 'Краткое описание для магазина интеграций',
    about: 'Детальное описание: что даёт интеграция и как работает.',
    kind: 'keys',           // 'keys' для обычных API-ключей, 'gomafia' для спецпотока
    fields: [
      {
        key: 'my_service_token',  // должен совпадать с ключом в INTEGRATION_KEYS
        label: 'Токен API',
        type: 'password',
        placeholder: 'Введите токен',
        hint: 'Инструкция где найти токен (личный кабинет, команда бота и т.д.)',
      },
    ],
  },
]
```

**Поля `Product`:**
- `kind: 'keys'` — стандартный путь: ключи сохраняются через `PATCH /system/integrations/:key`
- `kind: 'gomafia'` — специальный потока GoMafia (POST `/gomafia/connect` + `/gomafia/club`); для нестандартных интеграций реализуйте отдельный роутер и добавьте аналогичную ветку в `save.mutationFn`

### Шаг 3. Использовать секрет на бэкенде

Для чтения сохранённого секрета в своём модуле:

```typescript
import { integrations } from '@titan/database'
import { decryptSecret } from '../system/system.router.js' // или выделить в lib/integrations.ts

const row = await db.select().from(integrations).where(eq(integrations.key, 'my_service_token')).limit(1)
if (!row[0]) throw new Error('Интеграция не настроена')
const token = decryptSecret(row[0].valueEnc)
```

**Безопасность:** секрет никогда не отдаётся наружу — только маскированное значение
(`••••XXXX`). Замена ключа происходит через отдельное поле ввода (не префиллится).

---

## Ключевые паттерны проекта

### Склад: только через `recordMovement`

**Никогда** не обновляйте `inventory.stock_quantity` напрямую. Используйте единственную
воронку: `apps/api/src/modules/inventory/ledger.ts → recordMovement()`.

```typescript
import { recordMovement } from '../inventory/ledger.js'

await db.transaction(async (tx) => {
  const result = await recordMovement(tx, {
    itemId: 'uuid',
    type: 'adjustment',      // opening|receipt|sale|return|adjustment|write_off|count|transfer
    delta: -2,               // знаковая дельта (штук)
    clamp: true,             // не уходить ниже 0 (по умолчанию true)
    requireTracked: false,   // true для POS: пропускать не-учётные товары
    unitCost: 150,           // цена единицы (только для type='receipt', пересчёт WAC)
    sourceType: 'adjustment',
    sourceId: null,
    reason: 'Ручная корректировка',
    userId: user.id,
  })
  // result: { qtyAfter, applied, avgCost, ok }
})
```

Инвариант: `inventory.stock_quantity == SUM(stock_movements.delta)` по каждому товару.
Функция блокирует строку товара `FOR UPDATE`, пересчитывает WAC (средневзвешенная
себестоимость) на приходе и пишет строку в `stock_movements` — журнал движений.

### Денежные операции: FOR UPDATE + идемпотентность

Операции с балансом клиента (`profiles.balance`) выполняются с `SELECT … FOR UPDATE`,
чтобы избежать гонок при параллельных запросах. Пример из `clients.router.ts`:

```sql
SELECT balance FROM profiles WHERE id = ${clientId} FOR UPDATE
```

Для предотвращения дублирования операций (retries, двойные клики) передавайте
`idempotencyKey` — уникальный ключ запроса клиента. Если ключ уже встречался,
`INSERT … ON CONFLICT DO NOTHING` вернёт пустой массив, и операция считается
уже выполненной.

### Атомарность в Drizzle ORM

```typescript
// Блокировка строки FOR UPDATE через Drizzle:
const [row] = await tx.select().from(someTable).where(eq(someTable.id, id)).for('update')

// Через raw SQL (когда нужны функции БД):
const rows = await tx.execute(sql`SELECT ... FROM ... WHERE id = ${id} FOR UPDATE`)
```

### React Query: staleTime и инвалидация

`QueryClient` в `apps/web/src/app/providers.tsx` настроен:
- `staleTime: 2 * 60_000` — 2 минуты свежести данных
- `gcTime: 30 * 60_000` — 30 минут жизни кэша
- `retry: 2`, `refetchOnWindowFocus: true`

Паттерн мутации с инвалидацией:

```typescript
const qc = useQueryClient()
const mutation = useMutation({
  mutationFn: (data: MyType) => api.post('/my-route', data),
  onSuccess: () => {
    qc.invalidateQueries({ queryKey: ['my-section'] })
    show('Сохранено', 'success')
  },
  onError: () => show('Ошибка сохранения', 'error'),
})
```

### UnsavedGuard (черновики ревизий и поставок)

Оборачивайте экраны с черновиками в `UnsavedGuardProvider` и регистрируйте состояние:

```typescript
// В компоненте верхнего уровня страницы:
import { UnsavedGuardProvider } from '@/components/manage/UnsavedGuard'
export default function MyPage() {
  return <UnsavedGuardProvider><MyPageContent /></UnsavedGuardProvider>
}

// В дочернем компоненте с грязным состоянием:
import { useUnsavedGuard } from '@/components/manage/UnsavedGuard'
const guard = useUnsavedGuard()

useEffect(() => {
  guard.register({
    isDirty: () => isDirty,
    onSave: async () => { await applyMutation.mutateAsync(data) },
    onDraft: async () => { await saveDraftMutation.mutateAsync(data) },
    onDiscard: () => { resetState() },
    title: 'ревизию', // винительный падеж
  })
  return () => guard.register(null)
}, [isDirty, data])
```

При клике по ссылке меню или перезагрузке страницы появится диалог с тремя кнопками:
«Сохранить», «Черновик», «Отменить изменения».

### Service Worker: бамп версии при фронт-изменениях

При любых изменениях фронтенда (новые компоненты, страницы, логика) нужно увеличить
`CACHE_VERSION` в `apps/web/public/sw.js`:

```javascript
// apps/web/public/sw.js
const CACHE_VERSION = 'v264'  // увеличить на 1 → 'v265'
```

Текущая версия: `v264`. SW зарегистрирован через
`apps/web/src/components/ServiceWorkerRegister.tsx`.

---

## Дизайн-система и UI-компоненты

Все UI-компоненты экранов «Управления» берутся из
`apps/web/src/components/manage/DesignSystem.tsx`.

### Стилевые константы

```typescript
import { INP, SEL, LBL } from '@/components/manage/DesignSystem'

// Поле ввода
<input style={INP} />

// Select
<select style={SEL} />

// Подпись поля (uppercase, JetBrains Mono)
<label style={LBL}>Название</label>
```

### Компоненты

```typescript
import {
  PageHeader, Button, IconButton, Sheet, Toggle, ConfirmDialog,
  SaveButton, SectionGroup, FormField, ToggleRow, StatChip, Chip,
  formatMoney,
} from '@/components/manage/DesignSystem'
```

| Компонент | Назначение |
|---|---|
| `PageHeader` | Шапка раздела: title, subtitle, кнопка назад, слот action |
| `Button` | Кнопка с вариантами `primary`/`secondary`/`ghost`, `loading`, `fullWidth` |
| `IconButton` | Кнопка-иконка |
| `Sheet` | Модальная панель (bottom sheet на мобильном, centered modal на десктопе) |
| `Toggle` | Переключатель (switch) |
| `ConfirmDialog` | Диалог подтверждения с `title`, `message`, `onConfirm`, `onCancel` |
| `SaveButton` | Кнопка сохранения с анимацией успеха |
| `SectionGroup` | Секция с заголовком (группирует FormField) |
| `FormField` | Строка формы с label и опциональным hint |
| `ToggleRow` | Строка с label + Toggle |
| `StatChip` | Бейдж с числовым значением и цветом |
| `Chip` | Текстовый бейдж |
| `formatMoney` | `formatMoney(1234.5)` → `"1 234,50 ₽"` |

### Дизайн-стандарт «тихая роскошь»

- Один violet-акцент: `#8B5CF6`. Не смешивать несколько ярких цветов в одном элементе.
- Стеклянный фон: используйте CSS-класс `glass-l2` для карточек.
- Шапки (`PageHeader`) — текст слева, не по центру.
- Инлайн-стили: весь стайлинг через `style={...}` — не через Tailwind-классы (исключение:
  `glass-l2`, `bg-mesh` и другие глобальные CSS-утилиты из `globals.css`).
- Не трогайте `backdrop-filter` / `WebkitBackdropFilter` у `glass-l2` — это критично
  для производительности на iOS.

### Toast-уведомления

```typescript
import { useToast } from '@/components/Toast'
const { show } = useToast()

show('Сохранено', 'success')      // тип: 'success' | 'error' | 'info' | 'warning'
show('Произошла ошибка', 'error')
show('Загрузка...', 'info', 5000) // кастомная длительность мс
```

---

## Иконки

Используйте компонент `apps/web/src/components/Icon.tsx`. Все иконки — собственные SVG,
не emoji и не иконочный шрифт:

```typescript
import { Icon } from '@/components/Icon'

<Icon name="inventory_2" size={20} color="#8B5CF6" />
<Icon name="add" size={24} />            // цвет из CSS currentColor
<Icon name="titan_ai" size={24} />       // кастомная иконка Titan AI
```

### Добавление новой иконки

1. Откройте `apps/web/src/components/Icon.tsx`.
2. Вставьте SVG-путь в объект `ICONS` под новым ключом:

```typescript
const ICONS: Record<string, React.ReactNode> = {
  // ... существующие иконки ...
  my_icon: (
    <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
  ),
}
```

**Обязательные правила:**
- viewBox всегда `0 0 24 24` (задан в SVG-обёртке компонента, не в `ICONS`)
- stroke-based, `strokeWidth 1.75` — без `fill` (используется `currentColor`)
- Имена ключей — snake_case, аналогично Material Icons (можно брать SVG-пути с materialdesignicons.com)

---

## Конвенции

### TypeScript

- Строгий режим: `"strict": true`, `"exactOptionalPropertyTypes": true`,
  `"noUncheckedIndexedAccess": true`, `"noImplicitOverride": true`
  (конфиг базы: `packages/config/tsconfig/base.json`).
- ESM: `apps/api` компилируется с `"module": "ESNext"`, импорты с `.js`-суффиксом
  (обязательно в `apps/api` — это ESM-пакет с `"type": "module"`).
- TypeScript strict без исключений: `// @ts-ignore` недопустим без обоснования.

### Коммиты

Проект использует conventional commits-стиль:

```
feat(модуль): краткое описание
fix(ui): исправление бага
refactor(api): рефакторинг
```

Примеры из истории: `feat(events): свайп-обновление, сегмент-вкладки, папки прошлых месяцев`,
`fix(pos): карточка смены пересчитывается при удалении/изменении чека`.

### Тестирование

Юнит-тестов нет. Качество кода проверяется через:

```bash
pnpm type-check   # TypeScript strict по всем пакетам
pnpm build        # полная сборка (включая tsc для api/database)
```

Подробнее: `docs/TESTING.md`.

### Модульная граница API ↔ фронт

Фронт обращается к API только через `apps/web/src/lib/api.ts` (`api.get/post/put/patch/delete`).
Клиент автоматически подставляет Bearer-токен из `auth.store.ts` и обрабатывает 401
(разлогинивание и редирект на `/login`).

### Структура нового модуля API — чеклист

- [ ] `apps/api/src/modules/<name>/<name>.router.ts` создан
- [ ] Роутер экспортирован как именованный `export const <name>Router`
- [ ] `requireAuth` стоит ДО `requireRole` в цепочке middleware
- [ ] Подключён в `apps/api/src/app.ts` через `app.route('/api/<path>', <name>Router)`
- [ ] Все публичные маршруты документированы комментарием над обработчиком
- [ ] Мутирующие операции обёрнуты в `db.transaction`
- [ ] Складские операции используют `recordMovement` из `ledger.ts`
- [ ] Денежные операции с балансом: `SELECT … FOR UPDATE` + `idempotencyKey`

### Структура нового экрана фронта — чеклист

- [ ] Директива `'use client'` в начале `page.tsx`
- [ ] `PageHeader` с правильным `title`
- [ ] Запросы через `useQuery` / `useMutation` из `@tanstack/react-query`
- [ ] Мутации инвалидируют связанные queryKey
- [ ] Уведомления через `useToast().show`
- [ ] Иконки через `<Icon name="...">`, не emoji
- [ ] Если экран работает с черновиком — `UnsavedGuardProvider` + регистрация
- [ ] Если добавлен в меню — `ManageMenu.tsx` обновлён
- [ ] `CACHE_VERSION` в `sw.js` увеличен
