# Фаза 1 — Tenant-context: убрать синглтон `db` (DATABASE-PER-CLUB)

> Версия: 2026-06-13. Детализация задачи **1.3** из `docs/audit/PLAN-PRODUCTION-SAAS.md`.
> Модель уже зафиксирована: **база-на-клуб**, поддомен-роутинг (`<club>.titanpos.ru`),
> control-plane БД-реестр, секреты клуба в его БД.
>
> **Scope этого документа:** только перевод доступа к БД с модульного синглтона на
> пер-запросный `db`, выбираемый по клубу. Провижининг новых БД, суперадмин-админка,
> биллинг, nginx/TLS, шифрование секретов — смежные задачи (1.1, 1.2, 1.4–1.8), здесь
> затрагиваются лишь как точки стыковки.
>
> **НИЧЕГО в коде ещё не меняется** — это план.

---

## 0. Что уже есть в репозитории (отправная точка)

Исследование показало, что часть фундамента **уже заложена** — план опирается на это, а не строит с нуля:

| Артефакт | Файл | Статус |
|---|---|---|
| Синглтон app-БД | `packages/database/src/client.ts` | `db` создаётся на момент импорта из `DATABASE_URL`, `max:10`. Реэкспортируется из `index.ts`. |
| Control-plane схема | `packages/database/src/control/schema.ts` | Готова: `clubs (id, slug, name, db_name, subdomain, status)`, `club_modules`, `subscriptions`, `subscription_payments`, `superadmins`, `superadmin_passkeys`, `control_audit`. |
| Control-plane коннект | `packages/database/src/control/client.ts` | **Готов и ленив**: `getControlDb()` создаёт пул при первом вызове, кэширует в модульной переменной, читает `CONTROL_DATABASE_URL` лениво, `closeControlDb()`. **Это эталон для `getClubDb()`.** |
| Control-plane вход | `packages/database/src/control/index.ts` | Экспортирует `getControlDb`, схему, операторы drizzle. |
| Control-plane миграция | `packages/database/src/control/migrations/001_control_init.sql` | Идемпотентна, соответствует схеме. |

**Чего нет (надо сделать в рамках 1.3):**
- Фабрики `getClubDb(dbName)` с кэшем пулов.
- `@titan/database/control` **не объявлен в `exports`** в `packages/database/package.json` (там только `"."`). Подэкспорт control и будущий подэкспорт фабрики надо добавить, либо импортировать фабрику из основного `index.ts`.
- Middleware `tenantContext`.
- В app-схемах **нет `club_id`/`tenant_id`** — и не нужно: изоляция чисто на уровне отдельной БД (это упрощает рефактор — запросы не переписываются, меняется только источник `db`).

---

## 1. Целевая архитектура

### 1.1. Фабрика `getClubDb(dbName)` с кэшем пулов

Новый файл `packages/database/src/clubPool.ts` (или дополнить `client.ts`). По образцу `control/client.ts`, но с **Map по `dbName`** вместо единственного инстанса:

```
// Псевдокод — НЕ для коммита, только иллюстрация структуры.
type ClubDb = ReturnType<typeof drizzle<typeof schema>>

interface PoolEntry { db: ClubDb; client: ReturnType<typeof postgres>; lastUsed: number }
const pools = new Map<string, PoolEntry>()

export function getClubDb(dbName: string): ClubDb {
  const hit = pools.get(dbName)
  if (hit) { hit.lastUsed = Date.now(); return hit.db }
  const connString = buildClubConnString(dbName)   // из шаблона base-URL + подмена пути БД
  const client = postgres(connString, { max: CLUB_POOL_MAX, connect_timeout: 10, idle_timeout: 60 })
  const db = drizzle(client, { schema })
  pools.set(dbName, { db, client, lastUsed: Date.now() })
  return db
}

export async function closeAllClubDbs(): Promise<void> { /* end() по всем пулам — для graceful shutdown */ }
export async function evictClubDb(dbName: string): Promise<void> { /* для restore/удаления клуба */ }
```

Ключевые решения фабрики:
- **Connection string клуба.** Берём шаблон из одного env (напр. `CLUB_DATABASE_URL_TEMPLATE` или базовый `DATABASE_URL`, у которого подменяется только имя БД в пути). Это значит: **один Postgres-сервер, много БД** (решение владельца №4). `dbName` приходит из `clubs.db_name`.
- **`max` на пул.** Сейчас синглтон держит `max:10`. При N клубах суммарно это `N×max` соединений → быстро упрёмся в `max_connections` Postgres (по умолчанию 100). См. раздел рисков 4.3. На старте берём **малый `max` на клуб** (2–4) + LRU-эвикция простаивающих пулов.
- **LRU-эвикция.** Простаивающие дольше TTL (напр. 10 мин) пулы закрываются (`client.end()`) и удаляются из Map. Это держит число открытых соединений под контролем при «спящих» клубах. Эвикция by `lastUsed` или by idle-таймеру.
- **`closeAllClubDbs()`** добавляется в graceful shutdown (`apps/api/src/index.ts`) рядом с `closeDb()`/`closeControlDb()`.

### 1.2. Middleware `tenantContext`

Новый файл `apps/api/src/middleware/tenant.ts`. Ставится **глобально в `app.ts`** ДО роутеров (после логгера/cors, до `requireAuth`):

```
// Псевдокод.
export const tenantContext = createMiddleware(async (c, next) => {
  const club = await resolveClubFromHost(c.req.header('Host'))   // см. 1.3, с кэшем
  if (!club || club.status !== 'active') return c.json({ error: 'Unknown or inactive club' }, 404)
  c.set('club', club)
  c.set('db', getClubDb(club.dbName))
  await next()
})
```

- Кладём `c.set('db', ...)` и `c.set('club', ...)` → доступны как `c.var.db` / `c.var.club` во всех роутерах.
- Расширяем `apps/api/src/types.ts`:
  ```
  export type AppEnv = { Variables: { user: JwtPayload; db: ClubDatabase; club: ClubMeta } }
  ```
  Тип `db` — экспортируемый из `@titan/database` `ClubDatabase`/`Database` (та же drizzle-поверхность, что и нынешний `Database`).

### 1.3. Резолюция поддомена → клуб (control-plane lookup с кэшем)

Функция `resolveClubFromHost(host)`:
1. Извлечь поддомен из `Host` (`club.titanpos.ru` → `club`; `admin.titanpos.ru` → суперадмин-зона, в app не маршрутизируется; голый `titanpos.ru`/`localhost` → фолбэк, см. 1.4).
2. Поиск в control-plane: `getControlDb().select().from(clubs).where(eq(clubs.subdomain, sub))` (или по `slug`).
3. **Кэш** результата в памяти процесса (`Map<subdomain, {club, expiresAt}>`, TTL напр. 30–60 с) — чтобы не бить control-БД на каждый запрос. Инвалидация по TTL; при смене статуса клуба суперадмином — опционально pub/sub-сигнал на сброс.
4. Вернуть `{ id, slug, dbName, subdomain, status, ... }` или `null`.

### 1.4. Фолбэк/backward-compat на время миграции

На каждом шаге прод должен работать. Стратегия совместимости:
- **Дефолтный клуб.** Пока wildcard-DNS/контрол-реестр не развёрнуты, `resolveClubFromHost` для неизвестного/голого хоста возвращает «дефолтный» клуб из env (`DEFAULT_CLUB_DB` = текущая единственная БД). Тогда `c.var.db` указывает на сегодняшнюю БД, и поведение не меняется.
- **Синглтон как фолбэк.** Существующий экспорт `db` из `@titan/database` **оставляем живым** до конца миграции. Файлы, ещё не переведённые на `c.var.db`, продолжают использовать синглтон. Так каждый PR (модуль) переключает свою группу файлов, не ломая остальные. Синглтон удаляется в самом конце (контрольная wave).
- **Тождество фолбэка.** На время совместимости важно, чтобы «дефолтный клуб» резолвился в **ту же connection string**, что и синглтон, иначе будут два пула к одной БД. Проще: `getClubDb(DEFAULT_CLUB_DB)` и синглтон используют один и тот же `DATABASE_URL`.

---

## 2. Пофайловая стратегия миграции

### Сводка по группам

| Группа | Файлов | Как меняется |
|---|---|---|
| Роутеры (есть `c`) | **22** | `const db = c.var.db` в начале каждого хендлера (или хелпер). Импорт `db` из `@titan/database` убрать, оставив импорты таблиц/операторов. |
| Сервисы/lib (нет `c`) | **6** | Добавить параметр `db` (или `exec: DbExecutor`). Вызовы из роутеров — передают `c.var.db`; из cron — явный `getClubDb`/итерация. |
| Cron | **2** | Принимать `db` параметром; планировщик итерирует по всем active-клубам. |
| Инфра (app/index/runner) | **3** | `app.ts` — health/ready по дефолт-клубу; `index.ts` — graceful shutdown закрывает все пулы; `runner.ts` — прогон по всем БД. |
| Боты | **2** | Полная переработка в бот-менеджер (по экземпляру на токен клуба). Самая дорогая группа. |
| backup.ts | **1** | Параметризовать `DATABASE_URL` → connection string конкретного клуба. |
| **Итого затронуто** | **36 файлов** | (33 импортируют `@titan/database` + `backup.ts` через `DATABASE_URL`; `app.ts`/`index.ts`/`runner.ts` уже в счёте групп) |

> Точнее: **33 файла импортируют `@titan/database`** (31 в `apps/api/src`, 2 бота) **+ `backup.ts`** (читает `DATABASE_URL` напрямую). Из 31 api-файла: 22 роутера, 6 сервисов/lib, 2 cron, 1 — `runner.ts`. `app.ts` и `index.ts` импортируют `db`/`closeDb`/`sql` (инфра).

---

### 2.1. РОУТЕРЫ (22 файла) — паттерн `const db = c.var.db`

Все используют `new Hono<AppEnv>()` и `requireAuth` (глобально через `.use('*', ...)` или per-route). Доступ к `c` есть в каждом хендлере. **Изменение механическое:** в начале тела хендлера `const db = c.var.db`, импорт `db` из `@titan/database` убрать (импорты таблиц/операторов оставить).

Отсортированы по объёму (число `db.`-обращений / число транзакций):

| Файл | db-refs | txn | Заметки по миграции |
|---|---|---|---|
| `modules/pos/pos.router.ts` | 74 | 7 | **Самый крупный.** Есть `type Tx = Parameters<...typeof db.transaction...>` (стр. 227) — заменить на тип от `c.var.db` или общий `DbExecutor` из `@titan/database`. SSE-эндпоинт чека (`/checks/:id/events`) — Redis-канал неймспейсить (см. 4.1). `publishEvent` использует `titan:updates`. |
| `modules/analytics/analytics.router.ts` | 66 | 0 | Только чтение, без транзакций — легко. Много таблиц в импорте. |
| `modules/ai/ai.router.ts` | 39 | 1 | `c.var.db` + AI-ключ становится пер-клубным секретом (1.8). Redis для стрима. |
| `modules/auth/auth.router.ts` | 36 | 0 | Логин/PIN/passkey. **WebAuthn `RP_ID` = поддомен клуба** (1.4 основного плана) — пасскеи изолируются по клубам. Redis-ключи `titan:pk:*` неймспейсить по клубу. |
| `modules/events/events.router.ts` | 33 | 1 | |
| `modules/clients/clients.router.ts` | 31 | 2 | Балансовые транзакции. |
| `modules/inventory/inventory.router.ts` | 26 | 5 | Много транзакций (ревизии/поставки). Вызывает `ledger.recordMovement` — передать `db`/`tx`. |
| `modules/menu/menu.router.ts` | 17 | 3 | |
| `modules/notifications/notifications.router.ts` | 17 | 0 | SSE staff-уведомлений (`NOTIF_CHANNEL='titan:staff-notifications'`) — неймспейсить по клубу (4.1). |
| `modules/supplies/supplies.router.ts` | 15 | 4 | |
| `modules/pricing/pricing.router.ts` | 15 | 3 | |
| `modules/discounts/discounts.router.ts` | 12 | 0 | |
| `modules/staff/staff.router.ts` | 11 | 0 | |
| `modules/expenses/expenses.router.ts` | 11 | 0 | |
| `modules/refunds/refunds.router.ts` | 8 | 1 | |
| `modules/spaces/spaces.router.ts` | 8 | 0 | |
| `modules/salary/salary.router.ts` | 6 | 0 | `staffId`-энфорсмент (0.1.3) не трогаем. |
| `modules/system/system.router.ts` | 6 | 0 | SSE на `titan:updates` (стр. 77) + кнопки backup/restore → пер-клубный backup (2.6). |
| `modules/certificates/certificates.router.ts` | 6 | 0 | |
| `modules/customers/customers.router.ts` | 5 | 0 | |
| `modules/cashops/cashops.router.ts` | 4 | 0 | |
| `modules/platega/platega.router.ts` | 2 | 1 | **Особый:** вебхук Platega приходит БЕЗ авторизации и БЕЗ клубного поддомена (Platega бьёт на фиксированный URL). Резолюция клуба тут идёт не по `Host`, а по сохранённому `checkId`/инвойсу → найти клуб через control-plane или по маршруту с явным `clubId` в URL вебхука. **Секреты Platega — пер-клубные** (1.8). Требует отдельного дизайна, см. 4.6. |

> `modules/upload/upload.router.ts` — **`@titan/database` НЕ импортирует** (работает с MinIO), но использует `Hono<AppEnv>` и `requireAuth`. Тип `AppEnv` расширится — проверить, что не сломается; бакет/префикс файлов желательно неймспейсить по клубу (вне scope 1.3, но отметить).

### 2.2. СЕРВИСЫ / LIB (6 файлов) — добавить параметр `db`

Нет `c`. Принимают `db`/`exec` параметром. Вызывающий роутер передаёт `c.var.db`; cron — явный db клуба. **Часть уже готова к этому.**

| Файл | Текущее состояние | Как менять |
|---|---|---|
| `lib/bonusLots.ts` | **Уже параметризован**: все функции принимают `exec: DbExecutor` (db или tx). **НО** внутри `expireBonuses` есть жёсткий `db.transaction(...)` (стр. 148) поверх синглтона — заменить на `exec`-based транзакцию (нужен исполнитель, умеющий `.transaction`, т.е. передавать корневой `db` клуба, а не `tx`). |
| `modules/shifts/shifts.service.ts` | **Частично**: `getShiftCashBalance(shiftId, exec = db)` уже принимает exec. Остальные (`getCurrentShift`, `openShift`, `closeShift`, `getBirthdaysToday`, `getShiftAnalytics`, `getLastShiftCashEnd`, `getShiftHistory`) используют синглтон. Дефолт `= db` убрать, db передавать обязательным первым параметром. Вызовы из `pos.router`/`shifts.router` → `c.var.db`. Внутренние `notify(...)` тоже получают db (см. push.ts). |
| `lib/loyalty.ts` | Синглтон. `countVisits`/`visitProgress`/`maybePromoteToResident` → добавить параметр `db`. Вызывается из `pos.router` и `auth.router` — передать `c.var.db`. |
| `lib/appSettings.ts` | Синглтон. `getNumericSetting`/`getBoolSetting` → добавить параметр `db`. Вызывается из многих роутеров — передать `c.var.db`. |
| `modules/inventory/ledger.ts` | `recordMovement` (2 db-ref). Добавить параметр `db`/`tx`. Вызывается из `pos`/`inventory`/`refunds`/`supplies` — обычно уже внутри транзакции → передавать `tx`. |
| `modules/notifications/push.ts` | **Критичный общий сервис.** `notify(...)` и `notifyClient(...)` используют синглтон `db` И глобальный Redis-канал. Добавить параметр `db` (и `club`/неймспейс канала). Вызывается отовсюду fire-and-forget (`void notify(...)`) — из роутеров (`c.var.db`), из `shifts.service` (проброшенный db), из `cron/balance-audit` (db клуба). `resolveNotifUrl`/`groupKeyFor` — чистые, не трогаем. |

### 2.3. CRON (2 файла) — db параметром + итерация по клубам

| Файл | Как менять |
|---|---|
| `cron/birthdays.ts` | `checkBirthdays()` использует синглтон + вызывает `expireBonuses(db)`, `getBonusExpiryDays(db)`, `accrueBonusLot(tx,...)`. Сигнатура → `checkBirthdays(db)`. Планировщик (`index.ts`) **итерирует по всем active-клубам**: `for (const club of activeClubs) await checkBirthdays(getClubDb(club.dbName))`. |
| `cron/balance-audit.ts` | `auditBalances()` → `auditBalances(db)`. Вызывает `notify(...)` — передать db/клуб. Планировщик итерирует по клубам аналогично. |

**Планировщик cron** (`apps/api/src/index.ts`, функции `scheduleBirthdayCron`/`scheduleBalanceAuditCron`): сейчас зовут задачу один раз. Станут: на каждый тик — `getControlDb()` → список active-клубов → прогон задачи по каждому (последовательно или с ограниченным параллелизмом, чтобы не открыть разом N пулов). Ошибка по одному клубу не валит остальных (уже есть `.catch`).

### 2.4. ИНФРА (3 файла)

| Файл | Как менять |
|---|---|
| `app.ts` | (1) Подключить `tenantContext` глобально до роутеров. (2) `/api/health/ready` сейчас `db.execute(sql\`select 1\`)` по синглтону — заменить на проверку control-БД (`getControlDb`) и/или дефолт-клуба; readiness платформы ≠ конкретный клуб. (3) Импорт `db` убрать. |
| `index.ts` | (1) Graceful shutdown: добавить `closeAllClubDbs()` и `closeControlDb()` рядом с `closeDb()`. (2) Cron-планировщики — итерация по клубам (2.3). (3) `assertEnv()` — добавить проверку `CONTROL_DATABASE_URL` (и шаблона club-URL). |
| `migrations/runner.ts` | Сейчас прогоняет `sql/*.sql` по синглтону. Станет: (а) control-миграции по control-БД; (б) для **каждого active-клуба** — прогон baseline (1.1) + `sql/*.sql` по его БД. Параметризовать `runMigrations(db)` + обёртка `runAllMigrations()` с итерацией. Идемпотентность уже есть (`_migrations`-таблица в каждой БД). |

### 2.5. БОТЫ (2 файла) — переработка в бот-менеджер

Самая дорогая группа. Сейчас каждый бот — **один процесс, один токен из env, один синглтон db**:
- `apps/bot-admin/src/index.ts`: `ADMIN_BOT_TOKEN`, находит профиль по `tgId` (+ allowlist `ADMIN_TG_IDS`), ходит в API по `API_URL` с JWT и **напрямую в синглтон db** (запросы смен/чеков/стока/событий, привязка Telegram). 2 транзакции (привязка).
- `apps/bot-wallet/src/index.ts`: `WALLET_BOT_TOKEN`, находит клиента **только по `tgId`** (без знания клуба), показывает баланс/историю. 1 транзакция (привязка).

**Проблема мультитенантности у ботов глубже, чем «db параметром»:**
1. **Один процесс ↔ один токен.** У каждого клуба свой бот-токен → нужен **менеджер**, который из control-plane читает active-клубы, расшифровывает их токены (1.6) и поднимает по экземпляру `grammy.Bot` на токен, привязывая хендлеры к `getClubDb(club.dbName)`.
2. **`tgId` не уникален между клубами.** Один человек может быть клиентом нескольких клубов. Сейчас wallet-бот ищет клиента по `tgId` глобально — в модели «БД-на-клуб» каждый Bot ищет в БД своего клуба, поэтому маршрутизация «токен → клуб → его db» решает это автоматически (один и тот же tgId в разных БД — разные профили).
3. **`JWT_SECRET` для диплинков.** Оба бота подписывают/проверяют диплинки привязки HMAC по `JWT_SECRET`. Если у клубов разные секреты — issuer (касса клуба) и его бот должны использовать секрет того же клуба. На время совместимости можно оставить общий `JWT_SECRET`, но в целевой модели — секрет клуба.
4. **API-вызовы бота.** bot-admin часть данных берёт через HTTP API (`apiGet`/`apiPost` с JWT). Эти вызовы должны идти на **поддомен клуба** (`<club>.titanpos.ru`), чтобы сработал `tenantContext`. Значит менеджер на каждый клуб знает его base-URL.

**Решение:** новый `apps/bot-manager` (или переработка обоих в один процесс) — реконсайл по control-plane (старт + периодически/по pub/sub), фабрика хендлеров принимает `(db, club, botType)`. Детальный дизайн — задача 1.7 основного плана; здесь фиксируем, что **прямые `db.`-обращения в ботах заменяются на db клуба, привязанный к токену.**

### 2.6. backup.ts (1 файл)

`lib/backup.ts` строит `pgEnv()` из `process.env['DATABASE_URL']` (PGHOST/PGUSER/PGDATABASE) и зовёт `pg_dump`/`psql`. Сейчас бэкапит единственную БД.

- `createBackup`/`restoreFromPath`/`restoreNamed`/`restoreFromUpload` → принимают **connection string / dbName клуба**. Имя файла включает slug клуба (`titan_<slug>_<ts>.sql.gz`). Ротация/листинг — по префиксу клуба.
- Вызовы из `system.router.ts` берут `c.var.club.dbName`.
- **restore требует эвикции пула** этого клуба (`evictClubDb(dbName)`), иначе старые соединения держат блокировки/видят дроп-кест. Сейчас restore делает `pg_terminate_backend` по чужим pid — пул API переподключится; в фабрике добавить явный `evictClubDb` перед/после restore.
- Сквозная задача «бэкап per-DB» (цикл по `club_*` + `titan_control`) — отдельный скрипт, вне 1.3, но backup.ts должен стать пер-клубным здесь.

---

## 3. Порядок (waves) — как держать прод живым

Каждая wave — отдельный PR (или серия). Прод остаётся работоспособным: **синглтон `db` живёт как фолбэк**, переведённые файлы используют `c.var.db` дефолт-клуба, поведение идентично текущему до развёртывания wildcard-DNS.

### Wave 0 — Фундамент (без поведения)
1. `getClubDb(dbName)` + кэш пулов + `closeAllClubDbs`/`evictClubDb` (`packages/database`).
2. Добавить `@titan/database/control` (и фабрику) в `exports` `package.json`.
3. `tenantContext` middleware + расширить `AppEnv` (`db`, `club`).
4. `resolveClubFromHost` + кэш + **дефолт-клуб** (фолбэк = текущая БД).
5. Подключить `tenantContext` в `app.ts` **в режиме «всегда дефолт-клуб»** (wildcard ещё не нужен).
- **Критерий:** прод работает как раньше; `c.var.db` доступен и указывает на текущую БД; синглтон ещё везде используется.

### Wave 1 — Сервисы/lib (общий слой) — 6 файлов
Сначала параметризуем общий слой, т.к. от него зависят роутеры и cron: `appSettings.ts`, `loyalty.ts`, `bonusLots.ts` (доделать), `ledger.ts`, `shifts.service.ts`, `push.ts`. Пока вызывающие передают синглтон → поведение не меняется, но сигнатуры готовы.
- **Критерий:** все сервисы принимают `db`; type-check зелёный; функционал не изменился.

### Wave 2 — Роутеры «только чтение» / простые — низкий риск
`analytics`, `discounts`, `customers`, `cashops`, `certificates`, `spaces`, `staff`, `expenses`, `salary`, `system` (без backup), `pricing`, `menu`, `supplies`. Перевод на `const db = c.var.db`, прокидывание db в сервисы.
- **Критерий:** каждый модуль изолированно зелёный; ручной smoke на дефолт-клубе.

### Wave 3 — Роутеры с деньгами/транзакциями — высокий риск
`pos` (самый большой, SSE + 7 txn), `clients`, `inventory`, `refunds`, `events`, `auth`, `notifications`, `ai`. Особое внимание: типы `Tx`, SSE-каналы (неймспейс), транзакции.
- **Критерий:** транзакции работают на `c.var.db`; SSE по-прежнему доставляет; деньги/склад сходятся.

### Wave 4 — Платежи (особый случай)
`platega.router.ts` — резолюция клуба для вебхука без поддомена (по `clubId` в URL вебхука или по инвойсу через control-plane) + пер-клубные секреты Platega.
- **Критерий:** вебхук находит правильный клуб и закрывает чек в его БД; чужой клуб недоступен.

### Wave 5 — Cron + инфра
`birthdays`/`balance-audit` параметризованы; планировщики в `index.ts` итерируют по active-клубам; `runner.ts` прогоняет по всем БД; graceful shutdown закрывает все пулы; `/health/ready` — по control-БД.
- **Критерий:** cron отрабатывает по нескольким тестовым клубам изолированно; деплой-миграции проходят по всем БД.

### Wave 6 — backup пер-клуб
`backup.ts` + кнопки в `system.router` берут БД клуба; restore эвиктит пул.
- **Критерий:** бэкап/restore конкретного клуба не задевает другие.

### Wave 7 — Боты
Бот-менеджер (1.7). Самостоятельная крупная wave, может идти параллельно Wave 3–6 после Wave 0.

### Wave 8 — Снятие фолбэка (контрольная)
Удалить экспорт синглтона `db` из `@titan/database/index.ts` (оставив `closeDb` при необходимости). **Сборка падает на каждом не переведённом импорте** — это и есть финальная проверка полноты. Включить реальную резолюцию по поддомену (выключить «всегда дефолт-клуб»).
- **Критерий:** grep `from '@titan/database'` + использование `db.` в рантайм-путях = 0 (кроме фабрики/control); два клуба полностью изолированы.

### Тест изоляции (клуб A не видит клуб B) — на каждой денежной wave и в Wave 8
1. Поднять две тестовые БД `club_a`, `club_b` (+ записи в `clubs`).
2. Запросом на `a.titanpos.ru` создать данные (клиент/чек/настройка).
3. Тем же эндпоинтом на `b.titanpos.ru` — убедиться, что данных клуба A **не видно**, и наоборот.
4. Проверить SSE: событие, опубликованное в клубе A, **не приходит** подписчику клуба B (после неймспейса каналов — 4.1).
5. Проверить транзакцию: откат в клубе A не трогает клуб B.
6. Cron: `checkBirthdays`/`auditBalances` по обоим клубам пишут уведомления только в свою БД.

---

## 4. Точки риска

### 4.1. SSE и Redis pub/sub — глобальные каналы (ВЫСОКИЙ риск утечки между клубами)
Сейчас каналы **общие на весь процесс**, без клубного измерения:
- `titan:updates` — публикуют `pos.router` (`publishEvent`), `platega.router`, `shifts.service`; подписывают SSE в `pos.router` (`/checks/:id/events`) и `system.router`.
- `titan:staff-notifications` (`NOTIF_CHANNEL`) — публикует `push.ts` (`notify`), подписывает `notifications.router` (SSE staff).
- `titan:pk:*` (passkey challenge), `revoked:*`, `sse:*` (тикеты) в `auth.router`/`middleware/auth.ts`.

**Без изменения** подписчик клуба B получит события клуба A (хотя БД изолированы — утечёт пуш/SSE-полезная нагрузка). **Обязательно** неймспейсить каналы и ключи по клубу: `titan:<clubId>:updates`, `titan:<clubId>:staff-notifications`, `titan:<clubId>:pk:*`, `sse:<clubId>:*`, `revoked:<clubId>:*`. Альтернатива — отдельный Redis/logical db на клуб (дороже). Это нужно делать **в той же wave, что и соответствующий роутер**, иначе тест изоляции SSE провалится.

### 4.2. Транзакции и тип `Tx`
- `pos.router` выводит `type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0]` от синглтона; `bonusLots.ts` — `type Tx = ...Database['transaction']...`. После перехода `db.transaction` берётся от `c.var.db`. Нужен **единый экспортируемый тип** `DbExecutor`/`Tx` из `@titan/database` (он уже есть в `bonusLots.ts`, вынести в пакет), чтобы сервисы принимали и корневой db, и tx.
- Транзакция всегда в пределах **одного** пула/БД — кросс-клубных транзакций нет и быть не должно (это плюс изоляции). Проверить, что ни один хелпер не смешивает db двух клубов.

### 4.3. Пулы соединений — лимит Postgres (ВЫСОКИЙ риск при росте числа клубов)
- Синглтон: `max:10`. Если наивно дать каждому клубу `max:10`, при 10 клубах = 100 соединений = дефолтный `max_connections`. При 30 клубах — отказ Postgres.
- **Меры:** малый `max` на пул (2–4); LRU-эвикция простаивающих пулов; мониторинг `pg_stat_activity`; при росте — внешний пулер (PgBouncer, transaction-pooling) перед Postgres. Зафиксировать формула-бюджет: `Σ(max по живым пулам) + control(5) + cron-пиковая итерация < max_connections − резерв`.
- Cron-итерация по клубам **последовательно или малым параллелизмом** — иначе одномоментно откроет пул на каждый клуб.

### 4.4. Кэш пулов и эвикция
- Map растёт с числом клубов; нужна эвикция по idle-TTL (закрыть `client.end()` + удалить). Без неё «спящие» клубы держат соединения.
- Гонка: эвикция пула во время активного запроса → запрос упадёт. Эвиктить только пулы с `lastUsed` старше TTL и желательно с нулём in-flight (или мягко — `end({ timeout })`).
- Инвалидация кэша **резолюции клуба** (control-lookup) при смене статуса/поддомена/db_name суперадмином — иначе suspended-клуб ещё TTL секунд обслуживается. Pub/sub-сигнал «club changed» → сброс записи.

### 4.5. Миграции по всем клубам + провижининг
- `runner.ts` должен прогнать `sql/*` по **каждой** БД; новая БД клуба требует **baseline (000)** (задача 1.1) — без неё пустую БД не поднять (сейчас базовые таблицы создаёт только `drizzle-kit push`, не вызываемый в деплое).
- Деплой с новой миграцией: цикл по N клубам удлиняет старт; ошибка миграции одного клуба не должна блокировать остальных (но должна быть видна/алертить). Транзакция на миграцию уже есть.
- Провижининг (`CREATE DATABASE club_<slug>`) требует админ-коннекта (`POSTGRES_ADMIN_URL`) — отдельный пул вне фабрики; после создания — baseline+sql+сидинг. Это 1.5, но фабрика должна уметь подключиться к свежей БД (инвалидация «отрицательного» кэша, если резолвили до создания).

### 4.6. Platega-вебхук без поддомена (СРЕДНИЙ риск)
Вебхук Platega бьёт на фиксированный публичный URL **без клубного `Host` и без JWT**. `tenantContext` по `Host` тут не сработает. Варианты: (а) URL вебхука с явным `clubId`/`slug` в пути (`/api/platega/webhook/:clubId`), резолвить клуб из control-plane; (б) найти клуб по сохранённому при создании инвойса соответствию `invoiceId → clubId` в control-plane. Плюс **секреты Platega пер-клубные** (merchant_id/secret из БД клуба, не из env) + HMAC-проверка тела (0.1.1). Тщательно: подделанный вебхук не должен закрыть чужой чек.

### 4.7. Боты — один процесс на токены всех клубов
См. 2.5. Риски: реконсайл при добавлении/смене токена без рестарта; `tgId` коллизии между клубами (решается маршрутизацией токен→БД); общий vs пер-клубный `JWT_SECRET` для диплинков; API-вызовы бота на правильный поддомен. Память: N grammy-инстансов + потенциально N пулов в процессе бота (свой бюджет соединений отдельно от API).

### 4.8. Секреты клуба
AI (`POLZA_API_KEY`), Platega (`PLATEGA_MERCHANT_ID/SECRET`), бот-токены сейчас в глобальном env. Становятся пер-клубными (шифрованные в БД клуба, 1.6). На время совместимости — фолбэк на env, но в целевой модели чтение из БД клуба по `c.var.club`. Точки чтения: `ai.router`, `platega.router`, бот-менеджер.

### 4.9. backup/restore пер-клуб
restore дропает/пересоздаёт объекты БД клуба → **эвикция пула** обязательна, иначе stale-соединения. Во время restore приём денег по клубу должен блокироваться (maintenance-флаг, 0.3.5). Бэкап одного клуба не должен ½читать `DATABASE_URL` глобально (сейчас читает).

### 4.10. `/health/ready` и дефолт-клуб
Readiness платформы ≠ доступность конкретного клуба. `ready` должен проверять control-БД (и, опц., дефолт-клуб), а не падать, если один клуб недоступен. Иначе один битый клуб уронит readiness всего API.

---

## 5. Оценка объёма по группам

| Группа | Файлов | Характер работы | Относительная трудоёмкость |
|---|---|---|---|
| Фабрика + middleware + резолюция (Wave 0) | ~3 новых | Новый код, по образцу `control/client.ts`. Архитектурно важно, объёмно невелико. | M |
| Сервисы/lib (Wave 1) | 6 | Параметризация сигнатур; часть (`bonusLots`, `shifts.service`) уже наполовину готова. `push.ts` + неймспейс канала — аккуратно. | M |
| Роутеры простые (Wave 2) | 13 | Механически: `const db = c.var.db`, прокидывание в сервисы. Низкий риск. Объём — из-за числа файлов. | M–L (числом) |
| Роутеры денежные (Wave 3) | 8 | `pos` один тянет на полперехода (74 ref, 7 txn, SSE). Типы Tx, SSE-неймспейс, транзакции. Высокий риск. | L |
| Platega (Wave 4) | 1 | Малый по строкам, но дизайнерски сложный (вебхук без поддомена + пер-клубные секреты). | M (риск > объём) |
| Cron + инфра (Wave 5) | 5 | Итерация по клубам в планировщике/раннере; graceful shutdown; health. | M |
| backup (Wave 6) | 1 (+ system.router) | Параметризация `DATABASE_URL` + эвикция пула. | S–M |
| Боты (Wave 7) | 2 → бот-менеджер | **Самая дорогая.** Не просто `db` параметром — смена топологии процесса. | L |
| Снятие фолбэка (Wave 8) | ~2 | Удалить экспорт синглтона, включить резолюцию по поддомену, финальный прогон тестов изоляции. | S (но gатинг-критичная) |

**Итог по файлам:** **36 файлов** затронуто (33 импортируют `@titan/database` + `backup.ts` + расширение `types.ts`/`upload.router` от смены `AppEnv`). Из них механических (роутеры) — **22**, требующих продуманной сигнатуры (сервисы/cron) — **8**, инфраструктурных — **3**, архитектурно тяжёлых (боты) — **2**.

Главные риски сосредоточены **не** в механической замене `db` (она прямолинейна благодаря чистой database-per-club изоляции — запросы не переписываются), а в: **(1) неймспейсе Redis/SSE-каналов**, **(2) бюджете соединений Postgres**, **(3) Platega-вебхуке без поддомена**, **(4) переходе ботов на мультитенантную топологию**. Фолбэк-стратегия (синглтон жив до Wave 8, дефолт-клуб) позволяет вести миграцию модуль-за-модулем, не останавливая прод.
