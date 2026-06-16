<!-- generated-by: gsd-doc-writer -->
# Titan HUB — Справочник REST API

Базовый префикс всех маршрутов: `/api`. Сервер поднимается на порту `API_PORT` (по умолчанию `3001`).

---

## Содержание

1. [Аутентификация и роли](#аутентификация-и-роли)
2. [Глобальные заголовки и ограничения](#глобальные-заголовки-и-ограничения)
3. [Модуль auth — аутентификация](#модуль-auth)
4. [Модуль pos — POS-терминал](#модуль-pos)
5. [Модуль menu — меню и категории](#модуль-menu)
6. [Модуль inventory — склад и ревизии](#модуль-inventory)
7. [Модуль supplies — поставки](#модуль-supplies)
8. [Модуль clients — клиенты](#модуль-clients)
9. [Модуль collections — сбор взносов](#модуль-collections)
10. [Модуль shifts — смены](#модуль-shifts)
11. [Модуль cashops — кассовые операции](#модуль-cashops)
12. [Модуль salary — зарплата](#модуль-salary)
13. [Модуль pricing — тарифы и типы вечеров](#модуль-pricing)
14. [Модуль spaces — пространства (зоны/столы)](#модуль-spaces)
15. [Модуль discounts — скидки](#модуль-discounts)
16. [Модуль certificates — сертификаты](#модуль-certificates)
17. [Модуль refunds — возвраты](#модуль-refunds)
18. [Модуль notifications — уведомления](#модуль-notifications)
19. [Модуль ai — AI-ассистент](#модуль-ai)
20. [Модуль analytics — аналитика](#модуль-analytics)
21. [Модуль expenses — расходы](#модуль-expenses)
22. [Модуль system — системные настройки](#модуль-system)
23. [Модуль staff — сотрудники](#модуль-staff)
24. [Модуль events — мероприятия](#модуль-events)
25. [Модуль customers — заказчики](#модуль-customers)
26. [Модуль platega — платёжный вебхук](#модуль-platega)
27. [Модуль upload — загрузка файлов](#модуль-upload)
28. [Модуль gomafia — интеграция GoMafia](#модуль-gomafia)

---

## Аутентификация и роли

### Токен (JWT)

Все защищённые эндпоинты требуют JWT, подписанного `JWT_SECRET` (минимум 32 символа).

Токен передаётся тремя способами (порядок проверки в `requireAuth`):

| Способ | Формат | Использование |
|--------|--------|---------------|
| SSE-тикет (одноразовый) | `?ticket=<uuid>` | Только для EventSource/SSE; тикет Redis, TTL 60 с, сгорает при первом использовании |
| Bearer-заголовок | `Authorization: Bearer <token>` | Стандартный способ для всех REST-запросов |
| URL-параметр (устаревший) | `?token=<jwt>` | Обратная совместимость, маскируется в логах |

Отзыв токенов реализован через Redis-блэклист (`revoked:<sha256(token)>`). Отзыв производится при logout (`POST /api/auth/logout`). Проверка блэклиста fail-open: сбой Redis не блокирует доступ.

### Роли

| Роль | Описание |
|------|----------|
| `owner` | Владелец заведения. Полный доступ, включая CRUD сотрудников, тарифов, удаление поставок. |
| `staff` | Сотрудник/кассир. Доступ к POS, меню, складу, смене, расходам. Не может удалять проведённые поставки. |
| `tablet` | Планшет-киоск. Привязан к конкретному `linkedSpaceId`. Доступ только к своему чеку/пространству (IDOR-защита). |
| `client` | Клиент (Telegram WebApp / кошелёк). Ограниченный доступ к своему профилю и балансу. |

Публичные (без авторизации) эндпоинты: `GET /health`, `GET /api/health`, `GET /api/health/ready`, `GET /api/menu/categories`, `GET /api/menu/items`, `GET /api/menu/items/:id`, `GET /api/menu/items/:id/modifiers`, `GET /api/events/active-for-space/:spaceId`, `POST /api/platega/webhook`.

### Получение токена

```http
POST /api/auth/login/pin
Content-Type: application/json

{ "pin": "1234", "userId": "<uuid>" }
```

Ответ:
```json
{ "token": "<jwt>", "user": { "sub": "<uuid>", "role": "staff", "nickname": "Имя" } }
```

---

## Глобальные заголовки и ограничения

| Параметр | Значение |
|----------|----------|
| Лимит тела запроса | 1 МБ для всех `/api/*` маршрутов |
| CORS | Разрешён origin из переменной `FRONTEND_URL` |
| Rate limiting | PIN/пароль: 5 попыток за 15 мин на IP+userId; глобальный backstop: 50 неуспешных PIN-попыток за окно |
| Ошибки сервера | Всегда `{ "error": "Internal error" }` — стек-трейс не раскрывается |
| Health-check (liveness) | `GET /health` и `GET /api/health` — `{ "ok": true, "ts": <timestamp> }`, без авторизации |
| Health-check (readiness) | `GET /api/health/ready` — `{ "ready": true, "ts": <timestamp> }` или 503, без авторизации |

---

## Модуль auth

Базовый путь: `/api/auth`

### Вход

| Метод | Путь | Роль | Описание |
|-------|------|------|----------|
| `POST` | `/auth/login/pin` | — | Вход по PIN. Тело: `{ pin: string, userId?: uuid }`. Если `userId` не указан — fan-out по всем профилям с ролями staff/owner. Rate limit: 5 попыток/15 мин на IP+userId. |
| `POST` | `/auth/login/password` | — | Вход по паролю. Тело: `{ nickname: string, password: string }`. Rate limit аналогичный. |
| `POST` | `/auth/login/telegram` | — | Вход через Telegram initData. Тело: `{ initData: string }` (строка из Telegram WebApp). |
| `POST` | `/auth/logout` | auth | Отзывает текущий токен (добавляет в Redis-блэклист). |
| `POST` | `/auth/sse-ticket` | auth | Возвращает `{ ticket: "<uuid>" }` — одноразовый Redis-ключ (TTL 60 с) для EventSource. |

**Ответ входа:**
```json
{ "token": "<jwt>", "user": { "sub": "<uuid>", "role": "staff", "nickname": "Алиса" } }
```

### Профиль

| Метод | Путь | Роль | Описание |
|-------|------|------|----------|
| `GET` | `/auth/me` | auth | Текущий пользователь: `{ user: Profile }`. |
| `PATCH` | `/auth/me` | auth | Обновить свой профиль (nickname, fullName, phone). |
| `POST` | `/auth/pin/set` | auth | Установить/сменить PIN. Тело: `{ pin: string }` (4–8 цифр). |

### Планшет-сессия

| Метод | Путь | Роль | Описание |
|-------|------|------|----------|
| `POST` | `/auth/tablet-session` | — | Создать/получить сессию для планшета-киоска по коду пространства. Тело: `{ code: string }`. Возвращает JWT с ролью `tablet` и `linkedSpaceId`. |
| `POST` | `/auth/tablet-pair` | — | Привязать планшет по 6-значному коду. Тело: `{ code: string, deviceName?: string }`. Возвращает JWT с ролью `tablet`. |

### Passkey (WebAuthn)

| Метод | Путь | Роль | Описание |
|-------|------|------|----------|
| `POST` | `/auth/passkey/register/options` | auth | Получить опции регистрации passkey. RP_NAME/RP_ID/ORIGIN из env. |
| `POST` | `/auth/passkey/register/verify` | auth | Завершить регистрацию passkey. Тело: attestation-ответ браузера. Challenge хранится в Redis 5 мин. |
| `POST` | `/auth/passkey/authenticate/options` | — | Получить опции для входа по passkey. Тело: `{ userId?: uuid }`. |
| `POST` | `/auth/passkey/authenticate/verify` | — | Завершить вход по passkey. Тело: `{ challengeId: string, response: object }`. |
| `GET` | `/auth/passkey/list` | auth | Список своих passkey: `{ passkeys: [{ id, name, createdAt }] }`. |
| `DELETE` | `/auth/passkey/:id` | auth | Удалить свой passkey по id. |

---

## Модуль pos

Базовый путь: `/api/pos`

Все маршруты требуют авторизации (`requireAuth`). Планшет (`tablet`) может работать только с чеком/пространством своего `linkedSpaceId`.

### Вспомогательные эндпоинты

| Метод | Путь | Роль | Описание |
|-------|------|------|----------|
| `GET` | `/pos/players/search` | owner, staff | Поиск игрока по никнейму/тегу. `?q=` — строка запроса (транслитерация, раскладка). До 20 результатов. |
| `GET` | `/pos/players/:id` | owner, staff, tablet | Профиль игрока: баланс, бонусы, тир, фото. |
| `GET` | `/pos/spaces` | auth | Список активных пространств (зон). |
| `GET` | `/pos/prechecks` | owner, staff, tablet | Предчеки — виртуальные карточки для игроков, подтвердивших участие в опросе вечера. |

### Сводка смены (карточка кассы)

| Метод | Путь | Роль | Описание |
|-------|------|------|----------|
| `GET` | `/pos/shift-summary` | owner, staff | Сводка текущей смены: `{ shift, openChecks: { count, total }, cashInRegister, forecast }`. `forecast` содержит прогноз выручки Tai (`amount`, `currentTotal`, `additional`, `perCheck[]`). Возвращает `{ shift: null }` если смена не открыта. |

### Чеки

| Метод | Путь | Роль | Описание |
|-------|------|------|----------|
| `GET` | `/pos/checks` | owner, staff, tablet | Список открытых чеков текущей смены. Обогащён: `items[]` (до 5 названий позиций с ×количеством), `guestName`, `guestPhotoUrl`, `spaceName`, `spaceHourlyRate`, `hasRental`, `itemCount`. Планшет видит только чеки своей зоны. |
| `GET` | `/pos/checks/closed` | owner, staff | Недавно закрытые чеки (до 50, `?limit=`). Для выбора при оформлении возврата. |
| `POST` | `/pos/checks` | owner, staff | Открыть новый чек. |
| `GET` | `/pos/checks/:id` | owner, staff, tablet | Получить чек с позициями, модификаторами, оплатами, скидками, pending-заказами. |
| `PATCH` | `/pos/checks/:id` | owner, staff | Обновить поле чека (note, guestNames, playerId, spaceId, спейс-аренда). |
| `DELETE` | `/pos/checks/:id` | owner, staff | Отменить открытый чек. Возвращает сток списанных позиций. |

**Открыть чек** (`POST /pos/checks`):
```json
{
  "spaceId": "<uuid>",
  "playerId": "<uuid>",
  "guestNames": ["Иван"],
  "note": "День рождения",
  "linkedEventId": "<uuid>"
}
```

### Позиции чека

| Метод | Путь | Роль | Описание |
|-------|------|------|----------|
| `POST` | `/pos/checks/:id/items` | owner, staff, tablet | Добавить позицию. Тело: `{ itemId, quantity, modifierIds[] }`. |
| `DELETE` | `/pos/checks/:id/items/:itemId` | owner, staff, tablet | Удалить позицию из чека. |
| `GET` | `/pos/checks/:id/suggestions` | owner, staff, tablet | Предугаданные позиции (частые заказы резидента) для подсказок Tai. |

### Оплата

| Метод | Путь | Роль | Описание |
|-------|------|------|----------|
| `POST` | `/pos/checks/:id/pay` | owner, staff | Закрыть чек (оплата). |

**Тело запроса оплаты:**
```json
{
  "payments": [
    { "method": "cash", "amount": 1500 },
    { "method": "card", "amount": 500 }
  ],
  "certificateCode": "ABC123",
  "bonusAmount": 200,
  "playerId": "<uuid>",
  "note": "Скидка постоянному"
}
```

Методы оплаты: `cash`, `card`, `transfer`, `bonus`, `deposit`, `debt`, `split`, `certificate`.

Логика оплаты:
- Проверяет недоплату/переплату
- Лимит бонусов определяется настройкой `bonus_max_spend`
- Лимит долга — `max_client_debt`
- Автоначисление бонусов по ставке `bonus_accrual_rate %`
- Оплата атомарна (одна транзакция БД)

### SBP QR-платёж (Platega)

| Метод | Путь | Роль | Описание |
|-------|------|------|----------|
| `POST` | `/pos/checks/:id/qr` | owner, staff, tablet | Создать SBP QR-транзакцию через Platega. Поддерживает `surcharge8` (доплата 8%, не для tablet) и `tip` (чаевые). |
| `GET` | `/pos/checks/:id/qr/:transactionId/status` | owner, staff | Опросить статус QR-платежа по `transactionId`. |

### Заказы (tablet/кухня)

| Метод | Путь | Роль | Описание |
|-------|------|------|----------|
| `POST` | `/pos/checks/:id/orders` | owner, staff, tablet | Создать pending-заказ гостя (не добавляет позиции в чек, ждёт подтверждения). Тело: `{ items: [{ itemId, quantity }] }`. |
| `POST` | `/pos/orders/:orderId/confirm` | owner, staff | Подтвердить pending-заказ: позиции добавляются в чек. |
| `POST` | `/pos/orders/:orderId/reject` | owner, staff | Отклонить pending-заказ. |
| `POST` | `/pos/orders/:orderId/cancel` | owner, staff, tablet | Отменить pending-заказ (до подтверждения). |

### Чат чека

| Метод | Путь | Роль | Описание |
|-------|------|------|----------|
| `GET` | `/pos/checks/:id/chat` | owner, staff, tablet | История сообщений чата чека. |
| `POST` | `/pos/checks/:id/chat` | owner, staff, tablet | Отправить сообщение. Тело: `{ text: string, from?: string }`. |

### SSE — события чека

| Метод | Путь | Роль | Описание |
|-------|------|------|----------|
| `GET` | `/pos/checks/:id/events` | owner, staff, tablet | SSE-поток событий конкретного чека (Redis pub/sub). Требует `?ticket=<uuid>` (получить через `POST /auth/sse-ticket`). |

---

## Модуль menu

Базовый путь: `/api/menu`

### Категории меню

| Метод | Путь | Роль | Описание |
|-------|------|------|----------|
| `GET` | `/menu/categories` | — (публичный) | Список активных категорий. `?tabletOnly=true` — только видимые на планшете. |
| `POST` | `/menu/categories` | owner, staff | Создать категорию. |
| `PATCH` | `/menu/categories/reorder` | owner, staff | Массово обновить `sortOrder`. Тело: `{ items: [{ id, sortOrder }] }`. |
| `PATCH` | `/menu/categories/:id` | owner, staff | Обновить категорию (частично). |
| `DELETE` | `/menu/categories/:id` | owner | Удалить категорию. Товары категории переводятся в «без категории». |

**Поля категории:** `name`, `icon`, `color`, `isActive`, `isTabletVisible`, `sortOrder`.

### Позиции меню (inventory)

| Метод | Путь | Роль | Описание |
|-------|------|------|----------|
| `GET` | `/menu/items` | — (публичный) | Список активных позиций. `?categoryId=<uuid>`, `?tabletVisible=true`. Себестоимость (`costPrice`) не возвращается. |
| `GET` | `/menu/items/all` | auth | Полный список всех позиций (включая неактивные, без мягкоудалённых). С себестоимостью. |
| `GET` | `/menu/items/:id` | — (публичный) | Одна позиция + её модификаторы. Без `costPrice`. |
| `POST` | `/menu/items` | owner, staff | Создать позицию. `stockQuantity` всегда устанавливается в 0; изменение остатка — только через `/inventory`. |
| `PATCH` | `/menu/items/reorder` | owner, staff | Массовый пересорт. Тело: `{ items: [{ id, sortOrder }] }`. |
| `PATCH` | `/menu/items/:id` | owner, staff | Обновить позицию. `stockQuantity` игнорируется — только через аудируемый `/inventory/:id`. |
| `DELETE` | `/menu/items/:id` | owner | Мягкое удаление (`deletedAt`). Исторические чеки сохраняют позицию. |

**Поля позиции:** `name`, `category` (uuid категории), `price`, `costPrice`, `minThreshold`, `trackStock`, `isService`, `isActive`, `isTop`, `isTabletVisible`, `imageUrl`, `sortOrder`, `searchTags`, `linkedSpaceId`.

### Модификаторы

| Метод | Путь | Роль | Описание |
|-------|------|------|----------|
| `GET` | `/menu/items/:id/modifiers` | — (публичный) | Модификаторы позиции. |
| `POST` | `/menu/items/:id/modifiers` | owner, staff | Добавить модификатор. Тело: `{ name: string, price: number }`. |
| `DELETE` | `/menu/items/:itemId/modifiers/:modId` | owner, staff | Удалить модификатор. |

---

## Модуль inventory

Базовый путь: `/api/inventory`

Все маршруты требуют авторизации.

### Остатки

| Метод | Путь | Роль | Описание |
|-------|------|------|----------|
| `GET` | `/inventory` | owner, staff | Список позиций с остатками, себестоимостью и порогами. |
| `GET` | `/inventory/overview` | owner, staff | KPI-сводка склада (общая стоимость, позиции ниже порога, топ по обороту). |
| `GET` | `/inventory/:id/stats` | owner, staff | Статистика позиции: 30-дневный ряд продаж по бизнес-дням МСК. |
| `GET` | `/inventory/:id/movements` | owner, staff | История движений из `stock_movements` (тип, дельта, qty_after, reason, источник). |
| `POST` | `/inventory/:id/write-off` | owner, staff | Списание. Тело: `{ quantity: number, reason?: string }`. Создаёт движение типа `write_off`. |
| `PATCH` | `/inventory/:id` | owner, staff | Скорректировать остаток. Тело: `{ adjustDelta?: number }` (относительно) или `{ stockQuantity: number }` (абсолютно). Оба варианта создают движение типа `adjustment` через `recordMovement()`. |

> **Важно:** `stockQuantity` всегда равен сумме всех дельт в `stock_movements`. Прямая запись в поле невозможна — только через `recordMovement()`.

### Ревизии

| Метод | Путь | Роль | Описание |
|-------|------|------|----------|
| `GET` | `/inventory/revisions` | owner, staff | Список всех ревизий. |
| `POST` | `/inventory/revisions` | owner, staff | Создать и сразу применить ревизию. |
| `POST` | `/inventory/revisions/draft` | owner, staff | Создать черновик ревизии (`status=draft`, данные в `draft_data`). |
| `GET` | `/inventory/revisions/:id` | owner, staff | Получить ревизию с позициями. |
| `PATCH` | `/inventory/revisions/:id` | owner, staff | Исправить последнюю применённую ревизию (пересчитывает дельты). |
| `POST` | `/inventory/revisions/:id/apply` | owner, staff | Применить черновик: создаёт `revision_items` и движения склада. |

---

## Модуль supplies

Базовый путь: `/api/supplies`

Все маршруты требуют авторизации.

**Ключевое:** все поставки требуют `idempotencyKey` (строка до 80 символов). Повторный запрос с тем же ключом возвращает существующую запись без дублирования.

### Поставки

| Метод | Путь | Роль | Описание |
|-------|------|------|----------|
| `GET` | `/supplies` | owner, staff | Список поставок (с итогами). |
| `POST` | `/supplies` | owner, staff | Создать и провести поставку. Создаёт `supply_items` + движения `receipt` для каждой позиции. WAC пересчитывается. |
| `POST` | `/supplies/draft` | owner, staff | Создать черновик поставки (`status=draft`). Движения склада не создаются до `apply`. |
| `GET` | `/supplies/:id` | owner, staff | Получить поставку с позициями. |
| `PATCH` | `/supplies/:id` | owner, staff | Обновить черновик или проведённую поставку. Пересчитывает дельты склада относительно старых количеств. |
| `POST` | `/supplies/:id/apply` | owner, staff | Применить черновик: `FOR UPDATE` + проверка статуса, затем проводит строки и движения. |
| `DELETE` | `/supplies/:id` | owner (posted), owner/staff (draft) | Удалить поставку. Для проведённых — откат остатков; для черновиков — просто удаление. |

**Тело поставки:**
```json
{
  "idempotencyKey": "supply-2024-01-15-001",
  "supplierId": "<uuid>",
  "note": "Январская закупка",
  "items": [
    { "itemId": "<uuid>", "quantity": 10, "unitPrice": 150 }
  ]
}
```

---

## Модуль clients

Базовый путь: `/api/clients`

Все маршруты требуют авторизации.

### Список клиентов

| Метод | Путь | Роль | Описание |
|-------|------|------|----------|
| `GET` | `/clients` | owner, staff | Список профилей. `?filter=balances` — клиенты с балансом, `?filter=deposits` — депозиты > 0, `?filter=debtors` — долги < 0. `?q=` — поиск по никнейму/телефону. |
| `GET` | `/clients/:id` | owner, staff | Профиль клиента: баланс, бонусы, уровень, история. |

### Баланс и депозиты

| Метод | Путь | Роль | Описание |
|-------|------|------|----------|
| `POST` | `/clients/:id/balance` | owner, staff | Пополнить/списать баланс. Атомарно с `FOR UPDATE`. Поле: `profiles.balance` (> 0 = депозит, < 0 = долг). |

**Тело запроса баланса:**
```json
{
  "amount": 500,
  "type": "deposit",
  "description": "Пополнение",
  "idempotencyKey": "dep-2024-01-15-user123"
}
```

`idempotencyKey` — необязателен. При совпадении `ON CONFLICT DO NOTHING` на `transactions.idempotencyKey` предотвращает дублирование.

### Бонусы

| Метод | Путь | Роль | Описание |
|-------|------|------|----------|
| `POST` | `/clients/:id/bonus` | owner, staff | Начислить (`amount > 0`) или списать (`amount < 0`) бонусы. Начисление создаёт lot; списание атомарно снимает с балансом. |
| `GET` | `/clients/:id/transactions` | owner, staff | История транзакций (тип, сумма, дата). |

### Уровни лояльности

| Метод | Путь | Роль | Описание |
|-------|------|------|----------|
| `GET` | `/clients/tiers` | owner, staff | Список уровней клиентов (`clientTiers`). |
| `POST` | `/clients/tiers` | owner | Создать уровень. |
| `DELETE` | `/clients/tiers/:key` | owner | Удалить уровень. |

> Постоянное удаление клиента (`DELETE /clients/:id`, owner) — каскадирует все FK через pg_constraint introspection; для NOT NULL FK использует sentinel-профиль `__deleted_user__`.

---

## Модуль collections

Базовый путь: `/api/collections`

Сбор взносов резидентов: регулярные (Фонд клуба, recurring=авто-период YYYY-MM) и разовые (oneoff=единственный период `single`). Способы оплаты взноса: `cash`, `transfer`, `sbp`, `deposit`, `debt`. При `deposit`/`debt` атомарно изменяется баланс клиента и создаётся транзакция; при других — только запись взноса.

Все маршруты требуют авторизации (`requireAuth`).

### Сборы

| Метод | Путь | Роль | Описание |
|-------|------|------|----------|
| `GET` | `/collections` | owner, staff | Список активных сборов с текущим периодом, итогами и числом оплативших/исключённых. |
| `POST` | `/collections` | owner, staff | Создать сбор. Тело: `{ name, description?, kind: 'recurring'|'oneoff', isMandatory?, defaultAmount }`. |
| `PATCH` | `/collections/:id` | owner, staff | Обновить сбор (имя, описание, сумма, isMandatory, isActive). Мягкое архивирование через `isActive=false`. |
| `DELETE` | `/collections/:id` | owner, staff | Архивировать сбор (`isActive=false`). |
| `GET` | `/collections/:id` | owner, staff | Детализация сбора за период: ростер резидентов (включая статус оплаты и исключения), итоги по способам. `?period=YYYY-MM` — выбор периода (только для recurring). |
| `GET` | `/collections/:id/periods` | owner, staff | Список всех периодов сбора (ключ, метка, сумма, статус). |
| `PATCH` | `/collections/:id/periods/:periodId` | owner, staff | Изменить сумму периода. Тело: `{ amount: number }`. |

### Взносы

| Метод | Путь | Роль | Описание |
|-------|------|------|----------|
| `POST` | `/collections/:id/pay` | owner, staff | Отметить оплату взноса. Тело: `{ periodId, playerId, amount?, method, note? }`. Идемпотентен по уникальному индексу period_id+player_id. |
| `DELETE` | `/collections/:id/contributions/:contribId` | owner, staff | Снять отметку оплаты. При `deposit`/`debt` автоматически возвращает деньги на баланс клиента. |

### Исключения и персональные суммы

| Метод | Путь | Роль | Описание |
|-------|------|------|----------|
| `POST` | `/collections/:id/exclude` | owner, staff | Исключить участника из сбора. Тело: `{ playerId, duration: '1m'|'3m'|'forever' }`. |
| `POST` | `/collections/:id/include` | owner, staff | Вернуть участника в сбор (снять исключение). Тело: `{ playerId }`. |
| `POST` | `/collections/:id/member-amount` | owner, staff | Задать персональную сумму взноса. Тело: `{ playerId, amount: number|null }`. `null` сбрасывает к умолчанию периода. |

---

## Модуль shifts

Базовый путь: `/api/shifts`

Все маршруты требуют авторизации.

| Метод | Путь | Роль | Описание |
|-------|------|------|----------|
| `GET` | `/shifts/current` | auth | Текущая открытая смена или `null`. |
| `POST` | `/shifts/open` | owner, staff | Открыть смену. |
| `POST` | `/shifts/close` | owner, staff | Закрыть смену. Возвращает `{ shift, analytics }`. |
| `GET` | `/shifts/cash-balance` | owner, staff | Живой остаток кассы: cashStart + наличные поступления + внесения − изъятия − зарплаты − возвраты. |
| `GET` | `/shifts/history` | owner, staff | Последние смены. |
| `GET` | `/shifts/:id/analytics` | owner, staff | Аналитика по конкретной смене. |

**Открыть смену:**
```json
{
  "cashStart": 5000,
  "eveningType": "sport_mafia",
  "note": "Сезонный турнир",
  "adjustmentReason": null
}
```

Допустимые значения `eveningType`: `sport_mafia`, `city_mafia`, `kids_mafia`, `board_games`, `none`.

**Закрыть смену:**
```json
{
  "cashEnd": 12500,
  "adjustmentReason": "Лишняя купюра"
}
```

---

## Модуль cashops

Базовый путь: `/api/cashops`

Все маршруты требуют авторизации с ролью owner или staff.

| Метод | Путь | Роль | Описание |
|-------|------|------|----------|
| `GET` | `/cashops` | owner, staff | Операции текущей смены + остаток кассы (`getShiftCashBalance`). |
| `POST` | `/cashops` | owner, staff | Создать кассовую операцию. Требует открытой смены. |

**Тело кассовой операции:**
```json
{
  "type": "deposit",
  "amount": 3000,
  "description": "Внесение на вечер",
  "idempotencyKey": "cashop-2024-01-15-001"
}
```

Допустимые типы: `deposit` (внесение), `withdrawal` (изъятие), `salary` (выплата ЗП). `idempotencyKey` — необязателен.

---

## Модуль salary

Базовый путь: `/api/salary`

| Метод | Путь | Роль | Описание |
|-------|------|------|----------|
| `GET` | `/salary` | owner | Последние 100 выплат с разбивкой по периодам (период парсится из `note`). |
| `GET` | `/salary/estimate` | owner, staff | Расчёт зарплаты: база 700 + 100 ₽ за каждые 1 000 ₽ выручки сверх 7 000 ₽. `?date=YYYY-MM-DD` (день) или `?from=...&to=...` (период). |
| `POST` | `/salary/pay` | owner | Провести выплату ЗП. Наличная выплата атомарно создаёт запись `cashOperations` типа `salary` в той же транзакции. |

**Тело выплаты:**
```json
{
  "profileId": "<uuid>",
  "amount": 2500,
  "paymentMethod": "cash",
  "note": "Ноябрь 2024"
}
```

---

## Модуль pricing

Базовый путь: `/api/pricing`

Все маршруты требуют авторизации.

### Тарифы

Каждый тариф имеет backing-позицию в `inventory` (категория «Тарифы», `isService=true`, `trackStock=false`). Создание/обновление тарифа синхронизирует оба объекта.

| Метод | Путь | Роль | Описание |
|-------|------|------|----------|
| `GET` | `/pricing/tariffs` | auth | Список активных тарифов. |
| `POST` | `/pricing/tariffs` | owner | Создать тариф + backing inventory-позицию. Тело: `{ name, price, color?, description? }`. |
| `PATCH` | `/pricing/tariffs/:id` | owner | Обновить тариф и backing-позицию. |
| `DELETE` | `/pricing/tariffs/:id` | owner | Мягкое удаление (`isActive=false`). |

### Типы вечеров

| Метод | Путь | Роль | Описание |
|-------|------|------|----------|
| `GET` | `/pricing/evening-types` | auth | Список всех типов вечеров. |
| `POST` | `/pricing/evening-types` | owner | Создать тип вечера. Тело: `{ label: string, key?: string }`. `key` автослагируется из `label`, если не задан. Системные типы защищены от удаления. |
| `PATCH` | `/pricing/evening-types/:key` | owner | Обновить тип вечера. |
| `DELETE` | `/pricing/evening-types/:key` | owner | Удалить тип (не системный). |

### Ставки аренды мероприятий

| Метод | Путь | Роль | Описание |
|-------|------|------|----------|
| `GET` | `/pricing/event-rates` | auth | Ставки почасовой аренды для мероприятий. |
| `PATCH` | `/pricing/event-rates/:hours` | owner | Обновить ставку для указанного числа часов. Тело: `{ price: number }`. |

---

## Модуль spaces

Базовый путь: `/api/spaces`

Все маршруты требуют авторизации.

| Метод | Путь | Роль | Описание |
|-------|------|------|----------|
| `GET` | `/spaces` | auth | Список пространств (`isActive=true`). |
| `POST` | `/spaces` | owner | Создать пространство. |
| `PATCH` | `/spaces/:id` | owner | Обновить пространство. |
| `DELETE` | `/spaces/:id` | owner | Мягкое удаление (`isActive=false`). |
| `POST` | `/spaces/:id/tablet-link-code` | owner | Сгенерировать 6-значный код для привязки планшета. Хранится в Redis как `tablet:pair:{code}` → spaceId, TTL 300 с. |

**Поля пространства:** `name`, `type` (`small_booth` | `large_booth` | `hall` | `table` | `vr` | `ps5` | `zone`), `capacity`, `hourlyRate`, `isActive`.

---

## Модуль discounts

Базовый путь: `/api/discounts`

Все маршруты требуют авторизации.

| Метод | Путь | Роль | Описание |
|-------|------|------|----------|
| `GET` | `/discounts` | auth | Список скидок. |
| `POST` | `/discounts` | owner | Создать скидку. Тело: `{ name, type: 'percent'|'fixed', value, isActive? }`. |
| `PATCH` | `/discounts/:id` | owner | Обновить скидку. |
| `DELETE` | `/discounts/:id` | owner | Удалить скидку. |

### Правила уровней (tier-rules)

| Метод | Путь | Роль | Описание |
|-------|------|------|----------|
| `GET` | `/discounts/tier-rules` | auth | Список привязок уровень клиента → скидка. |
| `POST` | `/discounts/tier-rules` | owner | Создать привязку. Тело: `{ clientTier: string, discountId: uuid }`. |
| `DELETE` | `/discounts/tier-rules/:id` | owner | Удалить привязку. |

---

## Модуль certificates

Базовый путь: `/api/certificates`

Все маршруты требуют авторизации.

| Метод | Путь | Роль | Описание |
|-------|------|------|----------|
| `GET` | `/certificates` | owner, staff | Список сертификатов. |
| `POST` | `/certificates` | owner, staff | Выпустить сертификат. Тело: `{ nominal: number, code?: string }`. Если `code` не задан — генерируется автоматически (10 символов, без похожих букв, crypto.randomInt). |
| `GET` | `/certificates/validate/:code` | auth | Проверить сертификат: активен ли, баланс. |
| `PUT` | `/certificates/:id/deactivate` | owner | Деактивировать сертификат (`isUsed=true`). |

---

## Модуль refunds

Базовый путь: `/api/refunds`

Все маршруты требуют авторизации.

| Метод | Путь | Роль | Описание |
|-------|------|------|----------|
| `GET` | `/refunds` | owner, staff | Список возвратов. |
| `POST` | `/refunds` | owner, staff | Провести возврат. |

**Тело возврата:**
```json
{
  "checkId": "<uuid>",
  "reason": "Передумал",
  "tenders": [
    { "method": "cash", "amount": 500 }
  ],
  "items": [
    { "checkItemId": "<uuid>", "quantity": 1 }
  ]
}
```

Логика возврата:
- Проверяет возврат против реально оплаченных сумм по методу
- Поддерживает частичные возвраты, несколько способов оплаты
- Возврат `deposit`/`debt` → кредит на баланс клиента
- Возврат бонусов → кредит бонусного счёта
- Возврат сертификата → пополнение баланса сертификата
- Пропорциональный clawback начисленных бонусов
- Восстановление остатков склада (с ограничением: не более разницы «продано − уже возвращено»)

---

## Модуль notifications

Базовый путь: `/api/notifications`

Все маршруты требуют авторизации.

### Настройки

| Метод | Путь | Роль | Описание |
|-------|------|------|----------|
| `GET` | `/notifications/settings` | auth | Предпочтения по типам уведомлений (JSONB per-user). |
| `PUT` | `/notifications/settings` | auth | Сохранить предпочтения. Тело: `{ [notificationType]: boolean }`. |
| `GET` | `/notifications/types` | auth | Список всех поддерживаемых типов уведомлений. |

Поддерживаемые типы: `staff_call`, `request_bill`, `low_stock`, `supply_received`, `deposit_topup`, `debt_created`, `shift_open`, `shift_close`, `event_created`, `event_completed`, `birthday`.

### Web Push (VAPID)

| Метод | Путь | Роль | Описание |
|-------|------|------|----------|
| `POST` | `/notifications/push/subscribe` | auth | Подписать браузер. Тело: PushSubscription объект. |
| `POST` | `/notifications/push/unsubscribe` | auth | Отписать браузер. Тело: `{ endpoint: string }`. |
| `POST` | `/notifications/push/test` | auth | Отправить тестовое push-уведомление. |

### Telegram

| Метод | Путь | Роль | Описание |
|-------|------|------|----------|
| `POST` | `/notifications/tg-link` | auth | Запустить привязку Telegram. Возвращает 6-значный код, хранимый как `pending tgLinkRequest`. |

### SSE — поток уведомлений

| Метод | Путь | Роль | Описание |
|-------|------|------|----------|
| `GET` | `/notifications/stream` | auth | SSE-поток уведомлений персонала (Redis канал `titan:staff-notifications`). Требует `?ticket=<uuid>`. |

Планшетные уведомления отправляются через этот же поток — `staff_call` (вызов официанта) и `request_bill` (просьба счёта).

---

## Модуль ai

Базовый путь: `/api/ai`

| Метод | Путь | Роль | Описание |
|-------|------|------|----------|
| `POST` | `/ai/chat` | owner, staff | Отправить запрос AI-ассистенту. |
| `POST` | `/ai/action` | owner, staff | Выполнить именованное действие или произвольный запрос. Использует тот же обработчик, что и `/ai/chat`. |

**Тело запроса:**
```json
{
  "message": "Сколько мы заработали за эту неделю?",
  "action": "custom_query"
}
```

Провайдер: Polza (`POLZA_BASE_URL`, `POLZA_API_KEY`, модель `POLZA_MODEL`, по умолчанию `google/gemini-3.1-flash-lite`).

Поддерживаемые действия: 14 именованных действий + `custom_query`.

Логика `custom_query`:
1. Попытка text-to-SQL: генерируется SELECT/WITH запрос (только чтение), выполняется в `READ ONLY` транзакции с таймаутом 5 с, лимит 200 строк. Чувствительные колонки (`password_hash`, `pin_hash`, passkeys, tgId) исключены.
2. При ошибке — fallback на `buildBusinessSnapshot()` (сводка бизнес-данных без SQL).

Результаты кешируются в Redis на 60 с.

---

## Модуль analytics

Базовый путь: `/api/analytics`

Все маршруты требуют авторизации. Бизнес-день: 09:00 МСК → 09:00 следующего дня (настраивается через `business_day_start_hour`). Часовой пояс: UTC+3.

Параметры дат: `from` и `to` в формате `YYYY-MM-DD`.

### Телеметрия

| Метод | Путь | Роль | Описание |
|-------|------|------|----------|
| `POST` | `/analytics/track` | owner, staff | Fire-and-forget UX-событие (открытие раздела, смена периода). Тело: `{ event: string, props?: object }`. Ошибки игнорируются — не блокирует UI. |

### Основные отчёты

| Метод | Путь | Роль | Описание |
|-------|------|------|----------|
| `GET` | `/analytics/dashboard` | owner, staff | Сводка сегодня/вчера/месяц/прошлый месяц; topItems; paymentBreakdown; netToday; netMonth. |
| `GET` | `/analytics/overview` | owner, staff | Сравнение периода с предыдущим равным периодом. `?from=&to=`. |
| `GET` | `/analytics/revenue` | owner, staff | Ряд выручки по дням с расходами и себестоимостью. `?from=&to=`. |
| `GET` | `/analytics/payments` | owner, staff | Разбивка по методам оплаты. `?from=&to=`. |
| `GET` | `/analytics/products` | owner, staff | ABC-анализ позиций. `?from=&to=`. |
| `GET` | `/analytics/tariffs` | owner, staff | Выручка по тарифам + по типам вечеров + количество игровых вечеров + количество миникапов. `?from=&to=`. |

### Мероприятия

| Метод | Путь | Роль | Описание |
|-------|------|------|----------|
| `GET` | `/analytics/events` | owner, staff | Аналитика мероприятий за период. `?from=&to=`. Окно — по **календарной дате события** (`events.date`), а не по бизнес-дню. Возвращает: `totals` (кол-во, часы, дни, выручка, средние), `byStatus`, `byCategory` (Титан/Выезд/Миникап), `byWeekday` (загрузка Пн–Вс), `topCustomers` (до 8), `topZones` (до 6). |

### Клиенты

| Метод | Путь | Роль | Описание |
|-------|------|------|----------|
| `GET` | `/analytics/clients` | owner, staff | Удержание (14 дней), сегменты (новые/активные/спящие в окне 90 дней), topSpenders, продажи гостей. `?from=&to=`. |
| `GET` | `/analytics/segment-members` | owner, staff | Список клиентов конкретного сегмента. `?segment=new|active|sleeping`. |
| `GET` | `/analytics/players/:id` | owner, staff | Статистика конкретного игрока. |

### Персонал

| Метод | Путь | Роль | Описание |
|-------|------|------|----------|
| `GET` | `/analytics/staff` | owner, staff | Анализ чеков сотрудников. `?from=&to=`. |

### Смены

| Метод | Путь | Роль | Описание |
|-------|------|------|----------|
| `GET` | `/analytics/shifts` | owner, staff | Последние 30 смен с выручкой и разбивкой по способам оплаты. |
| `GET` | `/analytics/shifts/:id` | owner, staff | Детализация смены: чеки, оплаты, топ-15 позиций с ABC-маркировкой, игроки. |

### Чеки

| Метод | Путь | Роль | Описание |
|-------|------|------|----------|
| `GET` | `/analytics/checks` | owner, staff | Список закрытых чеков за бизнес-день/диапазон (до 1000). `?from=&to=`. Включает сводку (net/gross) и детали чека. |
| `GET` | `/analytics/checks/:id` | owner, staff | Полная детализация чека: позиции, оплаты, скидки, игрок, кассир, возвраты, COGS. |

**Структура `netBreakdown`** (возвращается в dashboard, overview, revenue, checks):
- `gross` — валовая выручка
- `refunds` — возвраты
- `sbpCommission` — комиссия СБП (8% от оплат методом `transfer`, только чеки без `acquiringSurcharge`)
- `cogs` — себестоимость
- `opex` — операционные расходы (без категории `salary`)
- `salary` — зарплата (из `salaryPayments`)
- `net` — чистая прибыль

---

## Модуль expenses

Базовый путь: `/api/expenses`

Все маршруты требуют авторизации.

| Метод | Путь | Роль | Описание |
|-------|------|------|----------|
| `GET` | `/expenses` | owner, staff | Список расходов. `?from=YYYY-MM-DD&to=YYYY-MM-DD`. |
| `GET` | `/expenses/summary` | owner, staff | Сводка расходов за период (по бизнес-дню): по категориям, ЗП по сотрудникам, себестоимость бесплатных списаний, два итога (`pnlTotal` = опекс + ЗП; `staffTotal` = ЗП + себестоимость списаний). |
| `GET` | `/expenses/catalog` | owner, staff | Подбор позиций по названию с последней ценой (`?q=`). До 20 результатов. |
| `GET` | `/expenses/:id` | auth | Получить расход по id. |
| `POST` | `/expenses` | owner, staff | Создать расход (список позиций). |
| `PATCH` | `/expenses/:id` | owner, staff | Обновить расход. |
| `DELETE` | `/expenses/:id` | owner | Удалить расход. |

**Категории расходов:** `rent`, `utilities`, `supplies`, `salary`, `marketing`, `equipment`, `other`, `consumables`, `tobacco`.

**Тело создания расхода:**
```json
{
  "expenseDate": "2024-01-15",
  "idempotencyKey": "exp-2024-01-15-office",
  "items": [
    { "category": "utilities", "description": "Электричество", "amount": 8000, "unitPrice": 8000, "quantity": 1 }
  ]
}
```

`idempotencyKey` — необязателен. При наличии `ON CONFLICT DO NOTHING` по суффиксированному ключу `:i` предотвращает дублирование при повторном запросе.

---

## Модуль system

Базовый путь: `/api/system`

Все маршруты требуют авторизации с ролью owner.

| Метод | Путь | Роль | Описание |
|-------|------|------|----------|
| `GET` | `/system/info` | owner | Версия приложения, текущая смена, название вечера (из `eveningTypes`). |
| `GET` | `/system/settings` | owner, staff | Все настройки из `app_settings` (key-value). |
| `PATCH` | `/system/settings` | owner | Обновить настройки. Тело: `{ [key: string]: value }`. |

**Ключевые настройки:** `bonus_accrual_rate` (% начисления бонусов), `bonus_max_spend` (макс. % оплаты бонусами), `max_client_debt` (лимит долга), `birthday_bonus` (бонус в день рождения).

### SSE — обновления системы

| Метод | Путь | Роль | Описание |
|-------|------|------|----------|
| `GET` | `/system/update` | owner, staff | SSE-поток обновлений (Redis канал `titan:updates`). Требует `?ticket=<uuid>`. |

### Резервные копии

| Метод | Путь | Роль | Описание |
|-------|------|------|----------|
| `GET` | `/system/backups` | owner | Список резервных копий. |
| `GET` | `/system/backup/status` | owner, staff | Статус последней резервной копии. |
| `POST` | `/system/backup` | owner | Создать резервную копию (`createBackup()`). |
| `POST` | `/system/restore` | owner | Восстановить именованную копию. Тело: `{ name: string }`. |
| `POST` | `/system/restore-upload` | owner | Восстановить из загруженного файла. |

---

## Модуль staff

Базовый путь: `/api/staff`

Все маршруты требуют роли `owner`.

| Метод | Путь | Роль | Описание |
|-------|------|------|----------|
| `GET` | `/staff` | owner | Список всех сотрудников (profiles с ролями owner/staff). |
| `POST` | `/staff` | owner | Создать сотрудника. |
| `PATCH` | `/staff/:id` | owner | Обновить сотрудника. |
| `DELETE` | `/staff/:id` | owner | Мягкое удаление (`deletedAt`) + удаление passkeys. |
| `POST` | `/staff/:id/reset-pin` | owner | Сбросить PIN сотрудника. |
| `POST` | `/staff/:id/telegram-link` | owner | Получить подписанную HMAC deep-link на admin-бота для привязки Telegram. |
| `GET` | `/staff/:id/passkeys` | owner | Список passkeys сотрудника. |
| `DELETE` | `/staff/:id/passkeys/:passkeyId` | owner | Удалить passkey сотрудника. |

**Тело создания сотрудника:**
```json
{
  "nickname": "Алиса",
  "password": "секрет123",
  "pin": "4321",
  "phone": "+79001234567",
  "role": "staff"
}
```

**Тело обновления:** поля `nickname`, `phone`, `role`, `password`, `permissions` — все необязательны.

`permissions` — JSONB объект `Record<string, boolean>` (ключи: `menu`, `inventory`, `clients`, `debtors` и другие). Управляет видимостью разделов меню на фронте.

---

## Модуль events

Базовый путь: `/api/events`

Все маршруты требуют авторизации.

### Мероприятия

| Метод | Путь | Роль | Описание |
|-------|------|------|----------|
| `GET` | `/events` | auth | Список мероприятий. `?from=YYYY-MM-DD&to=YYYY-MM-DD&spaceId=<uuid>`. |
| `GET` | `/events/active-for-space/:spaceId` | — (публичный) | Активное мероприятие для пространства на сегодня (для планшета). |
| `POST` | `/events` | owner, staff | Создать мероприятие. При `format=minicap` расходы (призовой фонд, обед, иные) автоматически создаются как `expenses`. |
| `GET` | `/events/:id` | auth | Получить мероприятие. |
| `PATCH` | `/events/:id` | owner, staff | Обновить мероприятие. Переход `planned→active` автоматически открывает чек (обычное мероприятие) или индивидуальные чеки всем участникам (миникап). Переход `→cancelled` отменяет открытые чеки. Проверка пересечений по пространству/времени (409 при конфликте). |
| `DELETE` | `/events/:id` | owner | Отменить мероприятие (`status=cancelled`). |

**Поля мероприятия:** `type` (`titan`|`exit`), `title`, `location`, `spaceId`, `date`, `startTime`, `endTime`, `paymentType` (`fixed`|`free`), `billingMode` (`amount`|`hourly`), `fixedAmount`, `manualAmount`, `plannedHours`, `maxGuests`, `status` (`planned`|`needs_clarification`|`active`|`completed`|`cancelled`), `comment`, `reminders`, `responsibleStaffId`, `customerName`, `customerPhone`, `format` (`regular`|`minicap`), `participationFee`, `prizeFund`, `lunchCost`, `otherCost`.

**Режим выставления счёта:**
- `billingMode=amount`: фиксированная сумма (`fixedAmount` или `manualAmount`)
- `billingMode=hourly`: ставка из `event_hourly_rates` по `plannedHours`

### Участники миникапа

| Метод | Путь | Роль | Описание |
|-------|------|------|----------|
| `GET` | `/events/:id/participants` | owner, staff | Список участников с привязанными чеками. |
| `POST` | `/events/:id/participants` | owner, staff | Добавить участника. Тело: `{ profileId: uuid, role: 'player'|'judge' }`. Максимум 10 игроков, 1 судья. Если мероприятие уже активно — сразу открывается чек. |
| `PATCH` | `/events/:id/participants/:pid` | owner, staff | Обновить предоплату. Тело: `{ prepaid: boolean }`. Синхронизирует `prepaidAmount` на открытом чеке. |
| `DELETE` | `/events/:id/participants/:pid` | owner, staff | Удалить участника. Если у участника есть позиции в чеке — отказ (400). |

### Аналитика мероприятия

| Метод | Путь | Роль | Описание |
|-------|------|------|----------|
| `GET` | `/events/:id/analytics` | owner, staff | Сводка: выручка, посещаемость, средний чек, топ-5 позиций. |

---

## Модуль customers

Базовый путь: `/api/customers`

Справочник заказчиков мероприятий (имя + телефон для автоподбора). Все маршруты требуют авторизации.

| Метод | Путь | Роль | Описание |
|-------|------|------|----------|
| `GET` | `/customers` | owner, staff | Список/поиск заказчиков. `?q=` — по имени или телефону (до 8 результатов при поиске, до 200 без поиска). |
| `POST` | `/customers` | owner, staff | Создать заказчика. Тело: `{ name?: string, phone?: string }`. |
| `PATCH` | `/customers/:id` | owner, staff | Обновить заказчика. |
| `DELETE` | `/customers/:id` | owner, staff | Удалить заказчика. |

> При создании мероприятия с `customerName`/`customerPhone` заказчик автоматически сохраняется в справочник (если не существует).

---

## Модуль platega

Базовый путь: `/api/platega`

### Вебхук оплаты СБП

| Метод | Путь | Роль | Описание |
|-------|------|------|----------|
| `POST` | `/platega/webhook` | — (без аутентификации) | Принять уведомление об оплате от Platega. |

**Верификация:** сравнение `X-MerchantId` и `X-Secret` заголовков с переменными окружения методом `timingSafeEqual` (защита от timing-атак).

Обрабатываются только уведомления со статусом `CONFIRMED`. Логика:
1. Вычисляет авторитетную сумму чека: позиции + модификаторы − скидки + аренда + базовая сумма мероприятия
2. Валидирует `reportedAmount`: допускает до +8% (надбавка СБП) и до +чаевые
3. Закрывает чек, начисляет бонусы
4. Идемпотентен: уже закрытый чек — пропуск без ошибки

---

## Модуль upload

Базовый путь: `/api/upload`

Требуется роль owner или staff.

| Метод | Путь | Роль | Описание |
|-------|------|------|----------|
| `POST` | `/upload/image` | owner, staff | Загрузить изображение. Форма: `multipart/form-data`, поле `file`. |

**Ограничения:**
- Максимальный размер: 2 МБ
- Допустимые форматы: JPEG, PNG, WebP, GIF (SVG не принимается — может содержать активные скрипты)
- Верификация по magic-bytes: MIME-заголовок клиента не доверяется, тип определяется по реальным байтам файла

Файл сохраняется в MinIO (bucket `titan-uploads`). Публичный URL возвращается в ответе:
```json
{ "url": "https://<MINIO_PUBLIC_URL>/titan-uploads/<timestamp>-<random>.<ext>" }
```

<!-- VERIFY: Публичный URL MinIO в продакшне зависит от конфигурации переменной MINIO_PUBLIC_URL на сервере -->

---

## Модуль gomafia

Базовый путь: `/api/gomafia`

Интеграция с платформой GoMafia (gomafia.pro) для подбора игроков при создании клиента. Все маршруты требуют авторизации.

| Метод | Путь | Роль | Описание |
|-------|------|------|----------|
| `GET` | `/gomafia/status` | owner, staff | Статус подключения: подключён ли клуб к GoMafia, маскированный логин, название клуба. |
| `POST` | `/gomafia/connect` | owner | Подключить интеграцию. Тело: `{ login, password, clubUrl? }`. Определяет клуб автоматически по аккаунту; `clubUrl` — если нужно указать вручную (ссылка вида `gomafia.pro/club/49`). |
| `POST` | `/gomafia/club` | owner | Сменить/указать клуб вручную. Тело: `{ clubUrl: string }`. |
| `DELETE` | `/gomafia/disconnect` | owner | Отключить интеграцию (удалить учётные данные). |
| `GET` | `/gomafia/search` | owner, staff | Поиск игрока на GoMafia по нику. `?q=` — строка поиска. |
| `GET` | `/gomafia/club/residents` | owner, staff | Список резидентов клуба с GoMafia (с кешированием). |
| `GET` | `/gomafia/player/:id` | owner, staff | Карточка игрока GoMafia по id (статистика, фото). |
