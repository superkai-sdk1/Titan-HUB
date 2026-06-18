# Аудит: БД & Миграции (2026-06-18)

Базовая линия — отчёт `docs/audit/08-database-migrations.md` (12.06). С тех пор: добавлен
провижининг database-per-club (`baseline.sql` + `provisioning.ts`), миграции 050–059,
закрыта часть прежних находок (049 добавил FK-индексы из H4). Но появился **новый
системный риск**: `baseline.sql` рассинхронизирован с набором миграций, а провижининг
помечает ВСЕ миграции применёнными → новый клуб поднимается с неполной схемой.

## Оценка: 55/100

Снижение относительно 62/100 (12.06) обосновано тем, что теперь провижининг нового клуба
**реально вызывается** (`POST` в superadmin), а не гипотетичен — и в текущем виде он
создаёт клуб без 6+ таблиц (`bookings`, `fiscal_receipts`, `collections*`, `integrations`,
`resident_payments`, `wallet_login_codes`). Это P0 для SaaS-онбординга. Денежные типы,
идемпотентность баланса (045), ledger склада, FK-индексы (049) — по-прежнему на хорошем
уровне; гарантированной потери денег на ОСНОВНОМ проде нет, поэтому не ниже 50.

---

## Дрейф схемы baseline vs миграции (вывод)

**Подтверждён и КРИТИЧЕН.** `baseline.sql` — это `pg_dump --schema-only`, снятый
НЕ на чистой границе. Фактический срез:

| Артефакт | Миграция | Есть в baseline? |
|---|---|---|
| `idx_supply_items_supply`, `idx_check_items_item` | 049 | ✅ да |
| `integrations` + `integrations_key_uq` | 050 | ❌ **НЕТ** |
| `gomafia_photo_url` | 051 | ✅ да |
| `tariffs.is_system`, `tariffs_key_unique` | 052 | ✅ да |
| `collections` / `collection_periods` / `collection_contributions` / `collection_members` | 053 | ❌ **НЕТ** |
| `fiscal_receipts` | 054 | ❌ **НЕТ** |
| `bookings` (+ 056/057 колонки) | 055–057 | ❌ **НЕТ** |
| `wallet_login_codes` | 058 | ❌ **НЕТ** |
| `resident_payments` | 059 | ❌ **НЕТ** |

То есть baseline содержит 001–049 + 051 + 052, но **пропускает 050 и всё 053–059**.
Это даже хуже «чистого среза до N»: набор непоследовательный (051/052 есть, 050 нет).

Механизм провала (`apps/api/src/modules/superadmin/provisioning.ts:243–259`):
`readMigrationIds()` читает **все** имена файлов из `migrations/sql/` и вставляет их в
`_migrations` нового клуба как «уже применённые». Поэтому штатный раннер (`runner.ts:52`,
`if (applied.has(file)) continue`) пропустит 050, 053–059 → таблицы НИКОГДА не создадутся
на новом клубе. Любой запрос к `bookings`/`fiscal_receipts` (raw SQL,
`bookings.router.ts:103`, `cron/fiscalize.ts:80`) и к `collections`/`resident_payments`
(drizzle) упадёт с `relation does not exist`. Документация в `provisioning.ts:6` и
`README.md:18` декларирует «squash 001..049» — но baseline руками докручивали до 052,
не обновив ни список, ни сам squash до 059. README прямо предупреждает «пересоздавать
baseline при изменении схемы» — этого не сделали для 050, 053–059.

---

## Находки по severity

### [P0] Новый клуб провижинится с НЕПОЛНОЙ схемой (дрейф baseline ↔ миграции)
**Файл:** `apps/api/src/provisioning/baseline.sql` (нет 050,053–059) +
`apps/api/src/modules/superadmin/provisioning.ts:243–259`
**Суть:** baseline не содержит 6 групп таблиц (см. таблицу выше), но провижининг помечает
все миграции 050–059 применёнными. Раннер их пропускает → таблиц нет.
**Риск:** каждый новый арендатор получает БД без брони, фискализации, сборов средств,
интеграций (секретов!), онлайн-платежей резидента и кодов входа в кошелёк. Это не
деградация, а немедленный 500 на этих фичах + невозможность хранить зашифрованные токены
бота (модуль `integrations` пуст → бот/AI/Platega не настраиваются). Disaster-recovery
«с нуля» так же сломан.
**Исправление (выбрать одно, надёжнее — оба):**
1. Пересобрать `baseline.sql` свежим `pg_dump --schema-only` с эталонной БД, прогнанной
   через ВСЕ миграции 001–059 (squash-точка = 059).
2. **Лучший вариант:** не помечать миграции «по списку файлов». Вместо
   `readMigrationIds()` пометить применёнными ТОЛЬКО те, что реально содержатся в baseline
   (хранить явный `BASELINE_THROUGH = '059'` и засеять `_migrations` ≤ этого номера), а
   050+ оставить раннеру. Тогда рассинхрон между squash-точкой и пометкой исключён
   конструктивно. Сейчас «маркер = readdir» гарантированно расходится с любым отстающим
   baseline.
3. Регресс-тест: `CREATE DATABASE tmp; psql -f baseline.sql; runMigrations(); SELECT to_regclass для всех таблиц схемы` — все NOT NULL.

### [P0] Схема-источник drizzle (`packages/database/src/schema`) не содержит `bookings` и `fiscal_receipts`
**Файл:** `packages/database/src/schema/*` — нет моделей `bookings`, `fiscal_receipts`
(есть только в raw-SQL миграциях 054/055 и raw-доступе из роутеров).
**Суть:** две прод-таблицы существуют только в SQL-миграциях; drizzle-схема (которая и есть
формальный «источник истины», именно её пушит `drizzle-kit push`) о них не знает.
**Риск:** если кто-то когда-нибудь поднимет схему через `drizzle-kit push` (как делалось
исторически — см. README), эти таблицы не создадутся; типобезопасности нет, доступ через
строковый SQL → опечатки не ловятся компилятором. Усиливает дрейф из P0 №1.
**Исправление:** добавить `bookings.ts` / `fiscal.ts` в `packages/database/src/schema` и
реэкспорт в `index.ts`; перевести роутеры на drizzle либо явно задокументировать raw-таблицы.

### [P1] `resident_payments`: нет БД-уникальности на `transaction_id` — webhook-идемпотентность только на app-уровне
**Файл:** `apps/api/src/migrations/sql/059_resident_payments.sql:11` (`transaction_id text`,
без unique) + `apps/api/src/modules/pay/residentSettle.ts:40–42`
**Суть:** идемпотентность settle держится на `SELECT ... FOR UPDATE` + `status!=='pending'`.
Это защищает от повторного применения ОДНОЙ строки, но НЕ от двух строк `resident_payments`
с одним и тем же провайдерским `transaction_id` (например при ретрае создания платежа до
вебхука). В отличие от чеков/транзакций, где есть `*_idempotency_key_uniq`, здесь БД-барьера
нет. Также нет `CHECK (status IN ...)` и `CHECK (purpose IN ...)` — значения свободные.
**Риск:** при гонке/двойном вебхуке возможно двойное зачисление депозита/двойной взнос в
Фонд. Денежный путь.
**Исправление:** `CREATE UNIQUE INDEX ... ON resident_payments (provider, transaction_id) WHERE transaction_id IS NOT NULL`;
`CHECK (status IN ('pending','confirmed','failed'))`, `CHECK (purpose IN ('deposit','debt','fund'))`,
`CHECK (amount > 0)`; FK `collection_id REFERENCES collections(id)` (сейчас просто `uuid` без FK).

### [P1] 7 FK из 008 по-прежнему `NOT VALID` и не валидированы — теперь ещё и зашиты в baseline
**Файл:** `apps/api/src/provisioning/baseline.sql` (7× `NOT VALID`),
ни одного `VALIDATE CONSTRAINT` во всём `migrations/`.
**Суть:** находка H3 от 12.06 не закрыта. Дополнительно `pg_dump` зафиксировал эти FK в
baseline как `NOT VALID`, значит **новые клубы тоже** получают недоверенные констрейнты
(хотя у них данных нет — для них это безвредно, но планировщик всё равно не считает их
доверенными).
**Риск:** возможны orphan-ссылки на старом проде; неоптимальные планы.
**Исправление:** миграция `ALTER TABLE ... VALIDATE CONSTRAINT ...` ×7 (берёт лишь
`SHARE UPDATE EXCLUSIVE`); предварительно вычистить orphan'ы. В новом baseline снять
`NOT VALID` (на пустой БД валидация мгновенна).

### [P2] Денежные `numeric` без `CHECK (>= 0)` нигде (M7 не закрыт) + рассинхрон precision
**Файл:** `migrations/sql/*` и `baseline.sql` — `grep CHECK ... >= 0` по суммам пуст;
`numeric(10,2)` (18 колонок) vs `numeric(12,2)` (33). Новые 053/059 — `(12,2)` (хорошо).
**Суть:** ни на одной денежной колонке нет доменного ограничения знака
(`tip_amount`, `acquiring_surcharge`, `certificates.balance/nominal`, `collections.*.amount`,
`resident_payments.amount`, `check_items.quantity`). Смешанные precision сохраняются.
**Риск:** баг данных (отрицательный tip/взнос/сумма платежа) не отлавливается БД.
**Исправление:** добавить `CHECK (>= 0)` где отрицательное невозможно (баланс профиля
оставить знаковым — это долг); унифицировать на `numeric(12,2)` как стандарт проекта.

### [P3] `CREATE EXTENSION pgcrypto` внутри транзакции миграции; дубль и мелочи
**Файл:** `050/053/054/055_*.sql` — `CREATE EXTENSION IF NOT EXISTS pgcrypto` исполняется
раннером внутри `db.transaction` (`runner.ts:58`).
**Суть:** на проде это работает (extension idempotent, в tx допустимо), но baseline
использует `gen_random_uuid()` (38×) и при этом `CREATE EXTENSION` НЕ содержит — полагается
на наличие функции в ядре PG13+. На PG<13 / нестандартной сборке новый клуб упадёт на
первом DEFAULT. Также `L10` (дубль `idx_stock_movements_item` 005/044) и `L11`
(нет advisory-lock в раннере при нескольких репликах) из прошлого аудита не закрыты — при
SaaS с несколькими api-репликами гонка применения миграций реальна.
**Исправление:** добавить `CREATE EXTENSION IF NOT EXISTS pgcrypto;` в начало `baseline.sql`;
обернуть тело `runMigrations` в `pg_advisory_xact_lock(<const>)`.

---

## Возможности апгрейда

1. **Конструктивно убрать класс «дрейфа baseline»:** заменить пометку миграций по `readdir`
   на явную константу `BASELINE_THROUGH` (+ CI-тест «пустая БД → baseline → migrate → схема
   совпадает со schema-dump прода»). Это превращает текущий молчаливый P0 в падение сборки.
   Параллельно перевести `bookings`/`fiscal_receipts` в drizzle-схему — один источник истины.

2. **Стандартизировать идемпотентность денежных путей:** единый паттерн
   `UNIQUE (idempotency_key) WHERE idempotency_key IS NOT NULL` + `onConflictDoNothing` для
   ВСЕХ денежных таблиц, включая новый `resident_payments(provider, transaction_id)`. Сейчас
   часть индексов «полные» (045/034), часть частичные (011) — задокументировать инвариант в
   одном месте и привести к одному виду.

3. **Доменные констрейнты + exclusion для брони:** добавить `CHECK (>= 0)` на суммы и
   `CHECK (status/purpose IN ...)` на 054/055/059; для `bookings`/аренды зон ввести
   `EXCLUDE USING gist` на пересечение интервалов одной `space_id` — БД сама запретит
   двойную бронь (дешёвая фича-выгода поверх уже существующего инварианта
   `uniq_one_open_rental_per_space` из 048).
