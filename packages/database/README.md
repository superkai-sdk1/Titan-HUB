<!-- generated-by: gsd-doc-writer -->
# @titan/database

Drizzle ORM — схема базы данных и клиент PostgreSQL для проекта Titan HUB.

Пакет является единственным источником TypeScript-типов для всех таблиц монорепо. Реальные SQL-миграции (`ALTER TABLE …`) хранятся в `apps/api/src/migrations/sql/` и применяются раннером `apps/api/src/migrations/runner.ts` при старте API-контейнера. Drizzle-схема здесь — только определения типов и структуры; команды `db:push`/`db:migrate` **не используются в проде** (приоритет у раннера).

---

## Содержание

- [Установка](#установка)
- [Структура пакета](#структура-пакета)
- [Клиент базы данных](#клиент-базы-данных)
- [Файлы схемы и таблицы](#файлы-схемы-и-таблицы)
  - [profiles.ts](#profilests)
  - [menu.ts](#menuts)
  - [checks.ts](#checksts)
  - [finance.ts](#financets)
  - [shifts.ts](#shiftsts)
  - [spaces.ts](#spacests)
  - [notifications.ts](#notificationsts)
  - [passkeys.ts](#passkeysts)
  - [events.ts](#eventsts)
  - [customers.ts](#customersts)
- [Публичный API (index.ts)](#публичный-api-indexts)
- [Как пакет используется в монорепо](#как-пакет-используется-в-монорепо)
- [Сборка](#сборка)
- [Миграции](#миграции)

---

## Установка

Пакет приватный (`"private": true`) и подключается только через workspace-ссылку:

```json
"@titan/database": "workspace:*"
```

Добавить зависимость в нужный app/package:

```bash
pnpm add @titan/database --filter @titan/api
```

---

## Структура пакета

```
packages/database/
├── package.json
├── tsconfig.json
└── src/
    ├── client.ts          # Инициализация drizzle + экспорт db
    ├── index.ts           # Реэкспорт db, типов и drizzle-операторов
    └── schema/
        ├── index.ts       # Реэкспорт всех файлов схемы
        ├── profiles.ts    # profiles, clientTiers
        ├── menu.ts        # menuCategories, inventory, modifiers, tariffs
        ├── checks.ts      # checks, checkItems, checkPayments, checkDiscounts,
        │                  # checkItemModifiers, pendingOrders, chatMessages
        ├── finance.ts     # transactions, bonusHistory, bonusLots, discounts,
        │                  # clientDiscountRules, certificates, supplies, supplyItems,
        │                  # supplyCorrections, stockMovements, expenses, refunds,
        │                  # salaryPayments, cashOperations, revisions, revisionItems,
        │                  # analyticsEvents
        ├── shifts.ts      # shifts, eveningTypes
        ├── spaces.ts      # spaces
        ├── notifications.ts # notifications, userNotificationSettings, pushSubscriptions,
        │                    # tgLinkRequests, appSettings
        ├── passkeys.ts    # passkeys
        ├── events.ts      # events, eventHourlyRates, eventParticipants
        └── customers.ts   # customers
```

---

## Клиент базы данных

**`src/client.ts`**

Читает `DATABASE_URL` из переменных окружения (обязательная; иначе бросает `Error` при старте). Подключение — через `postgres` (пул до 10 соединений, `connect_timeout: 10 с`, `idle_timeout: 60 с`). SSL не задаётся: API и PostgreSQL работают в одной Docker-сети.

```typescript
import { db } from '@titan/database'

const rows = await db.select().from(profiles).where(eq(profiles.role, 'staff'))
```

Экспортируемые объекты:

| Имя | Тип | Описание |
|---|---|---|
| `db` | `DrizzleDb` | Инициализированный клиент со всей схемой |
| `Database` | `type` | TypeScript-тип экземпляра клиента |

---

## Файлы схемы и таблицы

### `profiles.ts`

Пользователи и справочник статусов клиентов.

#### `profiles`

Центральная таблица пользователей — охватывает все роли: `owner`, `staff`, `tablet`, `client`.

| Колонка | Тип | Описание |
|---|---|---|
| `id` | `uuid` PK | |
| `nickname` | `text` UNIQUE | Логин / имя в системе |
| `fullName` | `text` | Полное имя (необязательно) |
| `role` | enum `role` | `owner` / `staff` / `tablet` / `client` |
| `clientTier` | `text` | Ключ статуса из `client_tiers` (по умолчанию `newbie`) |
| `balance` | `numeric(12,2)` | Депозитный баланс: >0 депозит, <0 долг |
| `bonusPoints` | `numeric(12,2)` | Бонусный баланс (источник истины) |
| `pin` | `text` | Хэш PIN-кода |
| `passwordHash` | `text` | Хэш пароля |
| `tgId` | `text` UNIQUE | Telegram user ID |
| `tgUsername` | `text` | Telegram-ник |
| `phone` / `birthday` | `text` | Контактные данные клиента |
| `photoUrl` | `text` | Аватар |
| `permissions` | `jsonb` | `Record<string, boolean>` — права сотрудника |
| `linkedSpaceId` | `uuid` | Привязанная зона (для планшет-киоска) |
| `searchTags` | `text[]` | Теги для быстрого поиска |
| `isResident` | `boolean` | Резидент-статус |
| `manualVisits` | `integer` | Виртуальные посещения (±к счётчику без кассы) |
| `needsPinSetup` | `boolean` | Флаг первичной установки PIN |
| `walletNotifyEnabled` | `boolean` | Уведомления в Wallet-боте (default `true`) |
| `createdAt` | `timestamptz` | |
| `deletedAt` | `timestamptz` | Мягкое удаление |

#### `clientTiers`

Управляемый справочник статусов клиентов (создаёт/удаляет владелец). Ключ — произвольный `text`; `profiles.clientTier` ссылается на него логически (не FK, так как статусы динамические).

| Колонка | Тип | Описание |
|---|---|---|
| `key` | `text` PK | Идентификатор статуса |
| `label` | `text` | Отображаемое название |
| `color` | `text` | HEX-цвет метки |
| `sortOrder` | `integer` | Порядок сортировки |
| `isSystem` | `boolean` | Системный (нельзя удалить) |

---

### `menu.ts`

Позиции меню, категории и тарифы.

#### `menuCategories`

Категории меню (напиток, закуска, тариф и т.д.).

| Колонка | Тип | Описание |
|---|---|---|
| `id` | `uuid` PK | |
| `name` | `text` | |
| `icon` | `text` | Ключ иконки (default `restaurant_menu`) |
| `color` | `text` | Акцентный цвет |
| `isActive` | `boolean` | Видна ли в меню |
| `isTabletVisible` | `boolean` | Видна ли на планшете кабинки |
| `sortOrder` | `integer` | |

#### `inventory`

Позиции меню и склада. Служит backing-таблицей для тарифов (поле `isService = true`).

| Колонка | Тип | Описание |
|---|---|---|
| `id` | `uuid` PK | |
| `name` | `text` | |
| `category` | `uuid` FK → `menuCategories.id` | |
| `price` | `numeric(10,2)` | Розничная цена |
| `costPrice` | `numeric(10,2)` | Себестоимость (WAC-кэш; пересчитывается при приёмке) |
| `stockQuantity` | `integer` | Текущий остаток (кэш; инвариант: == `SUM(delta)` в `stock_movements`) |
| `minThreshold` | `integer` | Порог «мало» (устаревший; см. `reorderPoint`) |
| `reorderPoint` | `integer` | Точка заказа (low-stock алерт срабатывает при `stockQuantity <= reorderPoint`) |
| `parLevel` | `integer` | Целевой уровень запаса (дозаказ добивает до par) |
| `trackStock` | `boolean` | Ведётся ли складской учёт |
| `isService` | `boolean` | Сервисная (не складируется; backing для тарифов) |
| `isActive` | `boolean` | Видна ли в меню/управлении |
| `isTop` | `boolean` | Топ-позиция |
| `isTabletVisible` | `boolean` | Видна на планшете кабинки |
| `imageUrl` | `text` | |
| `linkedSpaceId` | `uuid` | Привязка к зоне |
| `deletedAt` | `timestamptz` | Мягкое удаление (жёсткое нельзя — FK из `check_items`) |

#### `modifiers`

Модификаторы позиций (дополнительные опции к товару).

| Колонка | Тип |
|---|---|
| `id` | `uuid` PK |
| `name` | `text` |
| `price` | `numeric(10,2)` |
| `productId` | `uuid` FK → `inventory.id` CASCADE |

#### `tariffs`

Тарифы посещения (Гость / Резидент / Студент и т.д.). Каждый тариф привязан к скрытой backing-позиции меню (`itemId`) — через неё тариф попадает в чек как обычная строка.

| Колонка | Тип | Описание |
|---|---|---|
| `id` | `uuid` PK | |
| `name` | `text` | |
| `price` | `numeric(10,2)` | |
| `color` | `text` | HEX-цвет |
| `sortOrder` | `integer` | |
| `isActive` | `boolean` | |
| `itemId` | `uuid` FK → `inventory.id` | Backing-позиция меню |

---

### `checks.ts`

Кассовые чеки и связанные таблицы.

#### `checks`

Основная таблица чеков. Охватывает статусы `open` / `closed` / `cancelled`.

| Колонка | Тип | Описание |
|---|---|---|
| `id` | `uuid` PK | |
| `playerId` | `uuid` FK → `profiles.id` | Клиент (nullable) |
| `staffId` | `uuid` FK → `profiles.id` | Сотрудник, открывший чек |
| `shiftId` | `uuid` FK → `shifts.id` | Смена |
| `status` | enum `check_status` | `open` / `closed` / `cancelled` |
| `totalAmount` | `numeric(12,2)` | Итоговая сумма |
| `paymentMethod` | enum `payment_method` | Способ оплаты (`cash`/`card`/`transfer`/`bonus`/`deposit`/`debt`/`split`/`certificate`) |
| `bonusUsed` | `numeric(12,2)` | Использовано бонусов |
| `certificateUsed` | `numeric(12,2)` | Использовано по сертификату |
| `certificateId` | `uuid` | Ссылка на сертификат |
| `discountTotal` | `numeric(12,2)` | Суммарная скидка |
| `staffCompId` | `uuid` FK → `profiles.id` | Списание «на персонал» (чек без оплаты) |
| `spaceId` | `uuid` FK → `spaces.id` | Зона / кабинка |
| `spaceStartAt` / `spaceEndAt` | `timestamptz` | Время аренды зоны |
| `guestNames` | `text[]` | Имена гостей |
| `excludedDiscountIds` | `uuid[]` | Авто-скидки, вручную отключённые на чеке |
| `linkedEventId` | `uuid` | Ссылка на мероприятие |
| `eventBaseAmount` | `numeric(12,2)` | Фиксированная/ручная сумма основы события |
| `prepaidAmount` | `numeric(12,2)` | Предоплата (вычитается из остатка при закрытии) |
| `tipAmount` | `numeric(12,2)` | Чаевые по QR/СБП |
| `plategaTxId` | `text` | ID транзакции Platega (реконсиляция СБП) |

#### `checkItems`

Строки чека: какая позиция меню, количество и цена на момент продажи.

#### `checkItemModifiers`

Модификаторы, применённые к конкретной строке чека.

#### `checkPayments`

Разбивка оплаты по способам (split-оплата: несколько строк на один чек).

#### `checkDiscounts`

Применённые скидки на чек или отдельную позицию.

#### `pendingOrders`

Заказы гостя с планшета, ожидающие подтверждения сотрудником. Статусы: `pending` / `confirmed` / `rejected` / `cancelled`. Состав хранится снимком в `items` (jsonb).

#### `chatMessages`

Чат гость–персонал в рамках одного визита (чека). `sender`: `guest` (планшет кабинки) или `staff` (касса).

---

### `finance.ts`

Финансовые операции, склад, лояльность и документы.

#### `transactions`

Журнал денежных операций по балансам клиентов.

| Колонка | Тип | Описание |
|---|---|---|
| `id` | `uuid` PK | |
| `type` | `text` | `deposit` / `withdrawal` / `payment` / `refund` / `bonus_accrual` / `bonus_spend` / `visit_adjust` |
| `amount` | `numeric(12,2)` | |
| `idempotencyKey` | `text` | Ключ идемпотентности (миграция 045) |
| `checkId` | `uuid` FK → `checks.id` | |
| `playerId` | `uuid` FK → `profiles.id` | |
| `createdBy` | `uuid` FK → `profiles.id` | |

#### `bonusHistory`

История изменений бонусного баланса профиля.

#### `bonusLots`

Лоты начислений бонусов для FIFO-сгорания. `expiresAt = NULL` — бессрочный лот. `remaining` уменьшается при каждом списании.

#### `discounts`

Справочник скидок. Типы: `percent` / `fixed`. Могут быть автоматическими (`isAuto`) и привязаны к конкретному товару или клиенту.

#### `clientDiscountRules`

Правила автоскидок по статусу клиента. Связывает `clientTier` (text) с конкретной скидкой из `discounts`.

#### `certificates`

Подарочные сертификаты. Уникальный `code`, номинал (`nominal`), текущий остаток (`balance`).

#### `supplies`

Документы закупок / поставок.

| Колонка | Тип | Описание |
|---|---|---|
| `id` | `uuid` PK | |
| `status` | `text` | `posted` — проведена; `draft` — черновик (остатки не тронуты, миграция 046) |
| `draftData` | `jsonb` | Рабочее состояние черновика |
| `supplier` | `text` | |
| `totalCost` | `numeric(12,2)` | |
| `paymentMethod` | enum `payment_method` | |
| `idempotencyKey` | `text` | |

#### `supplyItems`

Строки поставки (товар + количество + цена за единицу). Опциональная привязка к `inventory.id`.

#### `supplyCorrections`

Аудит правок проведённых закупок. Каждая правка создаёт запись с обязательной причиной и суммами до/после.

#### `stockMovements`

**Immutable ledger движений склада.** Единственный источник истины по остатку.

| Колонка | Тип | Описание |
|---|---|---|
| `id` | `uuid` PK | |
| `itemId` | `uuid` FK → `inventory.id` | |
| `type` | `text` | `opening` / `receipt` / `sale` / `return` / `adjustment` / `write_off` / `count` / `transfer` |
| `delta` | `integer` | Изменение остатка (положительное = приход, отрицательное = расход) |
| `qtyAfter` | `integer` | Остаток после движения |
| `unitCost` | `numeric(12,2)` | Себестоимость единицы (WAC на момент списания или цена прихода) |
| `sourceType` | `text` | Тип документа-источника |
| `sourceId` | `uuid` | ID документа-источника |
| `reason` | `text` | Причина движения |
| `createdBy` | `uuid` FK → `profiles.id` | |

Инвариант: `inventory.stockQuantity == SUM(delta)` по каждому товару. Все write-сайты (POS, поставки, ревизия, возвраты, ручные правки) обязаны идти через `recordMovement()` в `apps/api/src/modules/inventory/ledger.ts`.

#### `revisions`

Документы инвентаризации (ревизий).

| Колонка | Тип | Описание |
|---|---|---|
| `status` | `text` | `applied` — проведена; `draft` — черновик (миграция 046) |
| `draftData` | `jsonb` | `{ items: [{ itemId, actual }] }` |

#### `revisionItems`

Строки ревизии: ожидаемый (`expected`) и фактический (`actual`) остаток по каждой позиции.

#### `expenses`

Расходы клуба.

| Колонка | Тип | Описание |
|---|---|---|
| `category` | `text` | `rent` / `utilities` / `supplies` / `salary` / `marketing` / `equipment` / `other` / `consumables` / `tobacco` |
| `amount` | `numeric(12,2)` | |
| `unitPrice` + `quantity` | `numeric` | Детализация (amount = unitPrice × quantity) |
| `expenseDate` | `text` | Дата в формате строки |
| `eventId` | `uuid` | Привязка к мероприятию (расходы миникапа) |
| `idempotencyKey` | `text` | |

#### `refunds`

Возвраты по чекам. Тип: `full` / `partial`. Причина: `return` / `exchange` / `discount` / `damage`. `tenders` — разбивка по способам оплаты. `restoredItems` — сток, фактически восстановленный этим возвратом.

#### `salaryPayments`

Выплаты зарплаты сотрудникам. Поддерживает ключ идемпотентности.

#### `cashOperations`

Кассовые операции в смене (внесение / изъятие / зарплата наличными). Привязаны к открытой смене (`shiftId`). Типы: `deposit` / `withdrawal` / `salary`.

#### `analyticsEvents`

Телеметрия UI-аналитики: какие разделы и метрики смотрят сотрудники. Лёгкие события с фронта.

---

### `shifts.ts`

#### `shifts`

Рабочие смены персонала. Статусы: `open` / `closed`. `cashStart` / `cashEnd` — наличность на открытии и закрытии. `eveningType` — ключ из справочника `evening_types`.

#### `eveningTypes`

Управляемый справочник типов вечеров (Спортивная мафия, Городская мафия, Настолки и т.д.). Создаётся/удаляется владельцем. Хранит `key` (PK) + `label` + `color`.

> Прежний `pgEnum('evening_type', ...)` в коде схемы оставлен для обратной совместимости типов, но живая БД использует колонку `text` (миграция 025).

---

### `spaces.ts`

#### `spaces`

Зоны и места клуба: кабинки, зал, столы, VR, PS5.

| Колонка | Тип | Описание |
|---|---|---|
| `id` | `uuid` PK | |
| `name` | `text` | |
| `type` | `text` (`SpaceType`) | `small_booth` / `large_booth` / `hall` / `table` / `vr` / `ps5` / `zone` |
| `hourlyRate` | `numeric(10,2)` | Часовая ставка аренды |
| `capacity` | `integer` | Вместимость (nullable) |
| `isActive` | `boolean` | Мягкое удаление (soft-delete через флаг) |

Тип колонки — `text` (не pgEnum), так как `ALTER TYPE ADD VALUE` нельзя выполнить внутри транзакции; допустимые значения задаются через `text + CHECK` в миграции `012_space_types_capacity.sql`.

---

### `notifications.ts`

#### `notifications`

Входящие уведомления пользователей (inbox). Хранит `type`, `title`, `body`, `meta` (jsonb), флаг `isRead`.

#### `userNotificationSettings`

Настройки типов уведомлений per-user. `types` — jsonb-карта `{ [type]: { enabled, channel?, telegram? } }`.

#### `pushSubscriptions`

Web-push подписки (VAPID). Уникальный `endpoint`, ключи `p256dh` и `auth`.

#### `tgLinkRequests`

Запросы на привязку Telegram-аккаунта (6-значный код). Статусы: `pending` / `approved` / `rejected`.

#### `appSettings`

Ключ-значение хранилище глобальных настроек приложения (например, `max_client_debt`, параметры бонусной программы).

---

### `passkeys.ts`

#### `passkeys`

WebAuthn/passkey-учётные данные пользователей.

| Колонка | Тип | Описание |
|---|---|---|
| `id` | `text` PK | Credential ID (base64url) |
| `userId` | `uuid` FK → `profiles.id` CASCADE | |
| `publicKey` | `text` | COSE-ключ в base64url |
| `counter` | `bigint` | Счётчик подписей (anti-replay) |
| `deviceType` | `text` | Тип устройства |
| `backedUp` | `boolean` | Является ли резервной копией |
| `transports` | `text[]` | Доступные транспорты |

---

### `events.ts`

#### `events`

Мероприятия (titan / exit). Статусы: `planned` / `needs_clarification` / `active` / `completed` / `cancelled`.

| Колонка | Тип | Описание |
|---|---|---|
| `type` | enum `event_type` | `titan` (внутри клуба) / `exit` (выездное) |
| `billingMode` | enum `event_billing_mode` | `amount` (фиксированная/ручная) / `hourly` (аренда зоны × время) |
| `paymentType` | enum `event_payment_type` | `fixed` / `per_head` / `free` |
| `format` | `text` | `regular` / `minicap` |
| `participationFee` | `numeric` | Взнос участника миникапа |
| `prizeFund` / `lunchCost` / `otherCost` | `numeric` | Расходы миникапа |
| `checkId` | `uuid` | Чек, открытый при старте события |
| `responsibleStaffId` | `uuid` FK → `profiles.id` | Ответственный сотрудник |

#### `eventHourlyRates`

Прайс-лист аренды для мероприятий (billingMode=hourly). Ключ — число часов, значение — цена за весь период.

#### `eventParticipants`

Ростер участников миникапа. Роли: `player` / `judge`. `prepaid` — флаг предоплаченного участника.

---

### `customers.ts`

#### `customers`

Справочник заказчиков мероприятий (отдельно от `profiles`). Только `name` + `phone` для связи и автоподбора при планировании событий.

---

## Публичный API (index.ts)

`src/index.ts` реэкспортирует всё необходимое для потребителей пакета:

```typescript
// Клиент и тип
export { db } from './client.js'
export type { Database } from './client.js'

// Все таблицы, типы и enum'ы из schema/index.ts
export * from './schema/index.js'

// Drizzle-операторы (не нужно устанавливать drizzle-orm отдельно)
export {
  eq, ne, and, or,
  gt, gte, lt, lte,
  isNull, isNotNull,
  inArray, notInArray,
  like, ilike,
  sql, desc, asc,
  count, sum, avg, max, min,
} from 'drizzle-orm'
```

Потребители импортируют всё из одного места:

```typescript
import { db, profiles, eq, desc } from '@titan/database'

const staff = await db
  .select()
  .from(profiles)
  .where(eq(profiles.role, 'staff'))
  .orderBy(desc(profiles.createdAt))
```

---

## Как пакет используется в монорепо

Основной потребитель — `apps/api`. Пример типичного импорта в роутере:

```typescript
// apps/api/src/modules/inventory/inventory.router.ts
import { db, inventory, stockMovements, eq, desc } from '@titan/database'
```

Остальные apps и packages:

| Потребитель | Что использует |
|---|---|
| `apps/api` | `db` + все таблицы + drizzle-операторы (все модули бэкенда) |
| `apps/bot-admin` | Типы `Profile`, `Shift`, `Notification` (уведомления) |
| `apps/bot-wallet` | Типы `Profile`, `Transaction`, `Certificate` (баланс/бонусы) |
| `apps/wallet` | Типы для Telegram WebApp кошелька |

---

## Сборка

```bash
# Из корня монорепо (через turbo)
pnpm build --filter @titan/database

# Или напрямую в пакете
cd packages/database
pnpm build        # tsc → dist/
pnpm dev          # tsc --watch
pnpm type-check   # tsc --noEmit (без вывода файлов)
pnpm clean        # rm -rf dist/
```

Точка входа после сборки: `dist/index.js` / `dist/index.d.ts`.

---

## Миграции

> **Важно:** `db:generate`, `db:migrate`, `db:push`, `db:studio` — вспомогательные команды для локальной разработки и генерации. В продакшне они **не применяются**.

**В продакшне** миграции применяет раннер `apps/api/src/migrations/runner.ts`:
- SQL-файлы хранятся в `apps/api/src/migrations/sql/` (файлы вида `001_*.sql` … `046_*.sql`)
- Раннер применяет их по порядку при каждом старте API-контейнера
- Учёт выполненных файлов — таблица `_migrations` в БД
- Миграции выполняются до открытия HTTP-сервера

Drizzle-схема в этом пакете служит **источником TypeScript-типов** и шаблоном для генерации новых SQL-файлов через `pnpm db:generate`. Сами `ALTER TABLE` применяются только через SQL-файл в `apps/api/src/migrations/sql/`.
