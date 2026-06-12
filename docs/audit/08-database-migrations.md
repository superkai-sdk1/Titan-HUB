# Аудит: База данных и миграции

## Summary

Схема в целом аккуратная для single-tenant: деньги почти везде `numeric(12,2)`/`numeric(10,2)`, идемпотентность денежных операций реализована, склад переведён в immutable-ledger (044), а критичные гонки (двойная открытая смена, двойной депозит) закрыты уникальными индексами. Но есть два системных риска для прода: **(1) base-таблицы создаются только `drizzle-kit push`, который НЕ запускается в деплое** — runner применяет лишь инкрементальные `ALTER`-ы, поэтому свежую БД (новый клуб) поднять воспроизводимо нельзя; **(2) полное отсутствие tenant-колонок** — модель данных одноклубная и для SaaS требует сквозного `club_id` на каждой таблице. Дополнительно: FK из миграции 008 навешены `NOT VALID` и никогда не валидируются, ряд горячих FK-колонок без индексов, а уникальность идемпотентности построена на «полном» индексе с NULL — это работает, но хрупко.

## Production-readiness score: 62 / 100

Обоснование: денежные типы, идемпотентность и ledger-инвариант склада сделаны на хорошем уровне (это самое важное для POS). Минус за невоспроизводимый bootstrap схемы (push не в деплое), отсутствие реальной валидации FK, точечные пропуски индексов на FK горячих путей и почти полную неготовность модели к multi-tenant. Ни одной находки уровня «гарантированная потеря денег в проде» не обнаружено, поэтому не ниже 60.

---

## Findings

### CRITICAL

**C1. Base-таблицы не создаются миграциями — bootstrap чистой БД невозможен из деплоя.**
`apps/api/src/migrations/runner.ts` применяет только файлы `sql/*.sql`, а это исключительно `ALTER`/`ADD COLUMN`/`CREATE TABLE IF NOT EXISTS` для вторичных сущностей. Базовые таблицы (`checks`, `check_items`, `profiles`, `inventory`, `modifiers`, `discounts`, `certificates`, `transactions`, `shifts`, `spaces`, `bonus_history`) в `sql/` **не создаются** (`grep CREATE TABLE.*checks` — пусто). Их создаёт `drizzle-kit push` (`packages/database/package.json:20`), но `push` не вызывается ни в `scripts/deploy.sh`, ни в `docker-compose.yml`, ни в `apps/api/Dockerfile` (`grep db:push` — пусто). На существующем проде это незаметно (таблицы уже есть), но при поднятии нового инстанса/нового клуба миграции `008/010/...` упадут на `ALTER TABLE checks ...`, т.к. таблицы ещё нет.
*Почему важно:* блокирует disaster recovery «с нуля» и любой SaaS-онбординг нового клуба. Это самый серьёзный риск этого раздела.
*Фикс:* зафиксировать единый источник истины. Либо добавить `pnpm --filter @titan/database db:push` (или `drizzle-kit migrate` со сгенерированным baseline) в `deploy.sh`/entrypoint api перед `runMigrations()`; либо вынести `CREATE TABLE` всех базовых таблиц в `sql/000_baseline.sql` (idempotent, `IF NOT EXISTS`) и отказаться от push в проде. Обязателен smoke-тест «empty DB → up → all green».

### HIGH

**H2. Отсутствуют tenant/club-колонки — модель данных одноклубная.**
`grep -niE 'tenant|club_id|venue_id|organization|org_id'` по `packages/database/src` и `migrations` — 0 совпадений. Каждая денежная/складская/клиентская таблица (`checks`, `transactions`, `inventory`, `shifts`, `profiles`, `expenses`, `bonus_lots`, `certificates`, `app_settings` c PK по `key`, …) — глобальная.
*Почему важно:* для подписочной продажи другим клубам нужна изоляция данных. Без `club_id` нельзя ни шардировать по клубу, ни безопасно делать общий инстанс, ни уникальные ограничения «в рамках клуба» (например `profiles.nickname` сейчас глобально-уникален — `packages/database/src/schema/profiles.ts:32`, что для multi-tenant неверно: два клуба не смогут завести одинаковый ник; `certificates.code` — то же, `schema/finance.ts:32`).
*Фикс:* спроектировать `club_id uuid NOT NULL` на всех бизнес-таблицах + составные уникальности `(club_id, nickname)`, `(club_id, code)`, `(club_id, idempotency_key)`; включить Postgres RLS либо сквозной фильтр на уровне репозитория. Это отдельный milestone — здесь фиксируем как блокер SaaS.

**H3. FK из миграции 008 навешены `NOT VALID` и никогда не валидируются.**
`apps/api/src/migrations/sql/008_fk_constraints.sql` создаёт 7 FK c `NOT VALID` (корректный приём — без долгой блокировки). Но во всём `migrations/` нет ни одного `VALIDATE CONSTRAINT` (`grep` — пусто). Значит существующие на момент 008 строки никогда не проверены: orphan-ссылки в `checks.certificate_id`, `checks.linked_event_id`, `check_discounts.discount_id`, `profiles.linked_space_id`, `inventory.linked_space_id`, `cash_operations.shift_id` могут существовать необнаруженными, а планировщик не учитывает такой constraint как доверенный.
*Почему важно:* частичная целостность, возможны «висячие» ссылки и неоптимальные планы; противоречит заявленной цели «целостность ссылок».
*Фикс:* добавить миграцию с `ALTER TABLE ... VALIDATE CONSTRAINT ...` для каждого из 7 ключей (валидация берёт только `SHARE UPDATE EXCLUSIVE`, прод-safe). Предварительно вычистить orphan-строки.

**H4. Непокрытые индексами FK на горячих путях (cascade-delete и join'ы).**
- `check_items.item_id → inventory` — без индекса (есть только по `check_id`, `003:13`). Join «продажи по товару» и FK-проверка при удалении/правке товара идут seq-scan.
- `supply_items.supply_id → supplies (ON DELETE CASCADE)` — без индекса. Удаление/откат закупки делает seq-scan `supply_items` на каждую строку.
- `check_item_modifiers.check_item_id`/`modifier_id` — без индексов (cascade delete по чеку → seq-scan).
- `modifiers.product_id → inventory (ON DELETE CASCADE)` — без индекса; удаление товара сканирует `modifiers`.
- `notifications.user_id`, `transactions.created_by`, `transactions.item_id`, `expenses.created_by`, `expenses.event_id`, `bonus_lots.profile_id` (есть частичный по `remaining>0`, но не общий) — FK без покрывающих индексов.
*Почему важно:* на росте данных cascade-delete и аналитические join'ы деградируют; для POS это заметно на закрытии смены/удалении позиции.
*Фикс:* добавить `CREATE INDEX IF NOT EXISTS` на перечисленные FK-колонки (минимум `check_items(item_id)`, `supply_items(supply_id)`, `check_item_modifiers(check_item_id)`, `modifiers(product_id)`, `notifications(user_id)`).

### MEDIUM

**M5. Инвариант `inventory.stock_quantity == SUM(stock_movements.delta)` не защищён БД.**
Схема (`schema/finance.ts:156-179`) и миграция 044 объявляют ledger источником истины, но согласованность держится только кодом `recordMovement()`. Нет триггера/периодической сверки в БД; любой прямой `UPDATE inventory` или баг в коде разъедутся молча.
*Фикс:* периодическая сверка (cron, как backup) с алертом при расхождении; опционально — БД-триггер, поддерживающий `qty_after` и блокирующий запись вне ledger-пути.

**M6. Уникальность идемпотентности построена на «полном» индексе с NULL — работает, но хрупко и неединообразно.**
`transactions/supplies/expenses/salary_payments/cash_operations` используют `CREATE UNIQUE INDEX ... (idempotency_key)` без `WHERE ... IS NOT NULL` (006, 034, 045). Полагается на «NULL != NULL» в Postgres. На PG15+ при `NULLS NOT DISTINCT` или при будущей замене на `UNIQUE` constraint это сломается: все строки без ключа (POS и т.п.) начнут конфликтовать. История уже показала грабли: 011 сделал частичный индекс, что сломало `ON CONFLICT` (см. фикс 034).
*Почему важно:* скрытая связь между формой индекса и `ON CONFLICT (idempotency_key)`; при апгрейде PG/смене ORM возможен инцидент в денежном пути.
*Фикс:* стандартизировать на частичный `WHERE idempotency_key IS NOT NULL` и привести код к `onConflictDoNothing` с тем же предикатом (как умеет текущая drizzle) — либо явно задокументировать зависимость и зафиксировать версию PG. Минимум — комментарий-инвариант в одном месте.

**M7. Денежные `numeric` без `CHECK (>= 0)` там, где отрицательное недопустимо.**
`checks.total_amount`, `prepaid_amount`, `tip_amount`, `acquiring_surcharge`, `certificates.balance`, `inventory.price` и т.п. — без доменных ограничений знака/диапазона. `profiles.balance`/`bonus_points` могут быть отрицательными по дизайну (долг), но `tip_amount < 0` или `nominal < 0` — заведомо баг данных.
*Фикс:* добавить `CHECK` на колонки, где отрицательное невозможно (`tip_amount >= 0`, `acquiring_surcharge >= 0`, `certificates.nominal >= 0`, `certificates.balance >= 0`, `check_items.quantity > 0`).

**M8. Смешанные precision у денег: `numeric(10,2)` vs `numeric(12,2)`.**
`inventory.price`, `modifiers.price`, `tariffs.price`, `check_items.price_at_time`, `events.fixed_amount`, `supply_items.cost_per_unit` — `(10,2)` (макс ~99,999,999.99), тогда как агрегаты (`checks.total_amount`, `transactions.amount`, `expenses.amount`) — `(12,2)`. Несогласованность сама по себе не баг (потолок (10,2) огромен для клуба), но усложняет рефакторинг и потенциально режет очень крупные событийные суммы.
*Фикс:* унифицировать денежный тип проекта (предложение — везде `numeric(12,2)`), задокументировать как стандарт.

**M9. `appSettings` с PK по `key` глобально-единичен — конфликт в multi-tenant.**
`schema/notifications.ts:52` — `app_settings(key PRIMARY KEY)`. Все настройки клуба (включая платёжные/бонусные параметры) лежат в одной строке-на-ключ на весь инстанс. Для SaaS — прямой конфликт между клубами.
*Фикс:* при вводе tenant — `PRIMARY KEY (club_id, key)`. То же касается `event_hourly_rates(hours PK)`, `client_tiers(key PK)`, `evening_types(key PK)`.

### LOW

**L10. Дублирующее объявление индекса `idx_stock_movements_item` (005 и 044).**
Оба `IF NOT EXISTS`, поэтому безвредно, но это технический долг/путаница. *Фикс:* убрать из 044 (он уже создан в 005), либо явно пометить как пересоздание.

**L11. `runner.ts` запускает `sql.raw(content)` без advisory-lock.**
`apps/api/src/migrations/runner.ts:58-61` — при параллельном старте нескольких реплик api два контейнера могут одновременно войти в `runMigrations`. Сейчас api в одном экземпляре, но при горизонтальном масштабировании (SaaS) возможна гонка применения. *Фикс:* `pg_advisory_xact_lock(<const>)` в начале транзакции миграции.

**L12. Бэкап: `restoreFromPath` глушит ошибки `ON_ERROR_STOP=0` и не проверяет результат.**
`apps/api/src/lib/backup.ts:112-117` — restore идёт с `ON_ERROR_STOP=0`, ошибки игнорируются, нет верификации, что данные восстановились. Также `createBackup` валидирует только `size < 1024`, без проверки целостности gzip/наличия ключевых таблиц. *Фикс:* для restore — `ON_ERROR_STOP=1` с явной обработкой; smoke-проверка после restore (`SELECT count(*) FROM checks`). Для backup — `gzip -t` + проверка, что дамп содержит ожидаемые `COPY`/`CREATE TABLE`.

**L13. Нет ретенции/партиционирования для растущих append-таблиц.**
`analytics_events`, `stock_movements`, `chat_messages`, `notifications`, `bonus_history`, `transactions` растут безгранично; индексы есть, но нет TTL/партиций по дате. *Фикс:* для телеметрии (`analytics_events`) — ретенция (cron-delete по `created_at`), для денежных/складских — оставить, но запланировать партиционирование по месяцу при росте.

---

## Идеи фич (мафия-клубы / анти-кафе) на уровне данных

1. **Бронирование зон/столов** — таблица `reservations(space_id, start_at, end_at, customer/profile, status)` с exclusion-constraint `EXCLUDE USING gist` на пересечение интервалов одной зоны: БД сама запретит двойную бронь VR/PS5/кабинки.
2. **Сгорание сертификатов и абонементов** — у `certificates` нет `expires_at`; добавить срок + лоты (как у бонусов), плюс «абонементы на N игр» (`passes(profile_id, remaining_games, expires_at)`) — типовой продукт мафия-клуба.
3. **Рейтинг/статистика игроков мафии** — `game_results(event_id, profile_id, role, won)` для лиги/турнирной таблицы миникапов; естественно ложится на уже существующий `event_participants`.
4. **Связь расхода с конкретной закупкой/смене для P&L по вечерам** — `expenses.shift_id`/`expenses.supply_id`, чтобы аналитика считала маржу по типу вечера (`evening_type` уже есть).
5. **Реферальная программа клиентов** — `profiles.referred_by uuid` + бонус-лот при первом визите приглашённого; дёшево на текущей модели.

## Quick wins (< 1 часа)

- Добавить индексы FK горячих путей: `check_items(item_id)`, `supply_items(supply_id)`, `check_item_modifiers(check_item_id)`, `modifiers(product_id)`, `notifications(user_id)` (H4) — одна миграция, все `IF NOT EXISTS`.
- Добавить `VALIDATE CONSTRAINT` для 7 FK из 008 после быстрой проверки orphan'ов (H3).
- `CHECK (tip_amount >= 0)`, `CHECK (acquiring_surcharge >= 0)`, `CHECK (certificates.nominal >= 0 AND balance >= 0)`, `CHECK (check_items.quantity > 0)` (M7).
- Убрать дублирующий `idx_stock_movements_item` из 044 или закомментировать (L10).
- `restoreFromPath`: переключить на `ON_ERROR_STOP=1` и логировать exit-code (L12).
- Добавить `gzip -t` в `createBackup` перед признанием успеха (L12).

## SaaS / multi-club последствия

- **Блокер №1 — bootstrap (C1):** онбординг нового клуба = поднять чистую схему. Сейчас это делает только ручной `drizzle-kit push`, не входящий в деплой. Без baseline-миграции автоматизировать выдачу нового инстанса нельзя.
- **Блокер №2 — изоляция (H2):** ни одной tenant-колонки. Требуется `club_id` на всех бизнес-таблицах + RLS или сквозной фильтр. Глобальные уникальности (`profiles.nickname`, `certificates.code`, PK-по-`key` справочников `app_settings`/`client_tiers`/`evening_types`, `event_hourly_rates.hours`) станут составными `(club_id, …)` — иначе клубы будут конфликтовать за одинаковые ники/коды/настройки.
- **Идемпотентность в multi-tenant (M6):** ключ идемпотентности должен быть уникален в рамках клуба `(club_id, idempotency_key)`, иначе ретрай одного клуба может «съесть» операцию другого.
- **Миграции под нагрузкой (L11):** при нескольких репликах api нужен advisory-lock, иначе гонка применения миграций на старте.
- **Бэкап/ретенция (L12, L13):** per-tenant backup/restore и ретенция append-таблиц станут обязательными (один общий дамп на инстанс не годится для пер-клубного восстановления и GDPR-подобного удаления данных клуба).
