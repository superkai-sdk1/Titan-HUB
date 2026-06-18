# Аудит аналитики: Производительность/Мультитенант/Безопасность (2026-06-18)

Файл: `apps/api/src/modules/analytics/analytics.router.ts` (1434 строки).
Контекст: `apps/api/src/middleware/auth.ts`, `apps/api/src/middleware/tenant.ts`,
`apps/api/src/middleware/module.ts`, `apps/api/src/app.ts`,
`apps/api/src/middleware/rateLimit.ts`, миграции `036_analytics_events.sql`,
`049_fk_perf_indexes.sql`, `003/004_*indexes`, `provisioning.ts`.

## Оценка: 72/100

Мультитенантность — чисто (все запросы идут в `c.var.db`). Авторизация на уровне
роутера присутствует (`owner`/`staff`), но слишком широкая. Главные минусы —
отсутствие индекса под горячий фильтр `checks(status, created_at)`, отсутствие
гейта модуля `analytics`, безлимитная телеметрия без ретенции и доступ `staff` к
выручке/зарплатам/ПДн.

---

## Находки по severity

### [P0] Нет индекса под горячий фильтр `checks(status='closed', created_at>=…)`
**Файл:** миграции `003_perf_indexes.sql:4,25`, `004_more_indexes.sql:10`,
`042_perf_indexes.sql:5` (а также сами запросы — `analytics.router.ts:106-165,223-320,
395-505,523-575,713-746,816-957,1278-1303,1363`).
**Суть.** Практически КАЖДЫЙ агрегат аналитики фильтрует
`checks.status='closed' AND checks.created_at >= X (< Y)`. Существующие индексы по
`checks`: `(shift_id,status)`, `(staff_id,status,created_at)`,
`(space_id,status) WHERE space_id NOT NULL`, `(player_id) WHERE player_id NOT NULL`,
`(linked_event_id)`, `(staff_comp_id)`. Ни одного по `(status, created_at)` или
`(created_at)` без ведущей колонки `staff_id`/`shift_id`/`space_id`. Запросы
`/dashboard`, `/overview`, `/revenue`, `/payments`, `/products`, `/clients` не имеют
этих ведущих фильтров → планировщик уходит в **seq-scan всей таблицы `checks`**
каждый раз. `netBreakdown` дополнительно делает 8 запросов, бьющих `checks` 3 раза.
**Риск.** На больших клубах (десятки-сотни тыс. чеков) дашборд/обзор деградируют
линейно по всей истории; `/dashboard` запускает `netBreakdown` дважды (день+месяц) =
ещё 16 запросов. Нагрузка на CPU БД, медленные ответы, риск таймаутов.
**Исправление.** Добавить
`CREATE INDEX IF NOT EXISTS idx_checks_status_created ON checks (status, created_at)`
(или частичный `WHERE status='closed'`). Аналогично закрыть `refunds(created_at)`,
`salary_payments(created_at)`, `check_payments(method)` (см. P1).

### [P1] `staff` видит полную финансовую аналитику, ФОТ и ПДн клиентов
**Файл:** `analytics.router.ts:15` (`requireRole('owner','staff')`), эндпоинты
`/dashboard`, `/overview`, `/staff` (зарплаты косвенно — comp-чеки/себестоимость),
`/clients`, `/players/:id`, `/checks/:id`.
**Суть.** Гейт роутера допускает `staff` ко ВСЕМ витринам: месячная выручка/прибыль,
COGS, ФОТ (`salaryPayments` участвует в `netBreakdown`/`/dashboard`), список
топ-плательщиков с никами/тиром/фото, карточка игрока с телефоном
(`/players/:id` → `profiles.phone`), `/checks/:id` → `player.phone`, `fullName`.
Рядовой кассир получает доступ к коммерческой тайне заведения и ПДн клиентской базы.
**Риск.** Утечка выручки/маржи/зарплат сотрудникам; нарушение принципа наименьших
привилегий; ПДн (телефоны, ФИО) доступны линейному персоналу — риск по 152-ФЗ.
**Исправление.** Развести гейты: финблок (`/dashboard`,`/overview`,`/revenue`,
`/products` с выручкой, `/staff`, ФОТ) — только `owner`; либо ввести роль/право
`analytics:finance`. Из ответов `staff` вырезать `phone`/`fullName`/`salary`/`profit`.

### [P1] `/api/analytics` смонтирован без `requireModule('analytics')`
**Файл:** `app.ts:158-181` (гейты модулей только для `events`/`certificates`/
`discounts`), `provisioning.ts:79` (`analytics` ∈ DEFAULT_ENABLED_MODULES).
**Суть.** Модуль `analytics` входит в дефолтную матрицу и предполагается отключаемым
суперадмином, но роут `app.route('/api/analytics', analyticsRouter)` не покрыт
`app.use('/api/analytics/*', requireModule('analytics'))`. Арендатор с явно
выключенным модулем `analytics` (`club_modules.enabled=false`) всё равно получит
полную аналитику.
**Риск.** Обход фиче-гейта/тарификации модуля; клуб без оплаченной аналитики ею
пользуется. На основном домене (club=null) — без изменений (fail-open by design).
**Исправление.** Добавить `app.use('/api/analytics/*', requireModule('analytics'))`
рядом с прочими `requireModule(...)`.

### [P1] `analytics_events` растёт безгранично — нет ретенции/чистки
**Файл:** `036_analytics_events.sql`, `analytics.router.ts:20-31` (`POST /track`).
**Суть.** Каждое UX-событие (открытие раздела, смена периода, drill-down) от любого
`owner`/`staff` пишется в `analytics_events` навсегда. Поиск по коду: ни одного
`DELETE`/cron/retention/prune для этой таблицы нет.
**Риск.** Неограниченный рост таблицы на каждом клубе → раздувание БД, бэкапов,
деградация при любом будущем чтении телеметрии. `props jsonb` без ограничения формы.
**Исправление.** Cron-чистка (`DELETE … WHERE created_at < now()-interval '90 days'`)
или партиционирование по времени; ограничить размер/ключи `props`.

### [P2] `/track` без специфичного rate-limit + произвольный `event`/`props`
**Файл:** `analytics.router.ts:20-31`; общий лимит — `rateLimit.ts` (600 req/min/user).
**Суть.** `event` валидируется (`min1/max64`), но `props: z.record(z.unknown())` —
любой JSON до 1 МБ (bodyLimit). Специального лимита на запись телеметрии нет: один
авторизованный аккаунт может слать ~600 insert/мин, раздувая `analytics_events`
(усиливает P1-рост). Запись fire-and-forget в `try/catch` — ок, UI не роняет.
**Риск.** Целевое раздувание таблицы/диска авторизованным инсайдером; «грязные»
`props` неизвестной формы.
**Исправление.** Отдельный, более жёсткий бакет на `/track`; whitelist ключей `props`
+ ограничение размера; опц. семплирование.

### [P2] Несколько эндпоинтов грузят все строки периода в память и агрегируют в JS
**Файл:** `/events` (`analytics.router.ts:610-695` — все события периода → Map по
категориям/заказчикам/зонам/дням недели), `/clients` сегменты
(`883-920` — 90-дневная выборка всех игроков в JS-цикл + `Set`),
`/segment-members` (`971-998` — selectDistinct + groupBy всех визитов за 90д,
фильтр/сортировка в JS), `/staff`, `/products` ABC (`581-590`).
**Суть.** Группировки/сортировки/накопительные доли считаются в приложении на полной
выборке периода, а не в SQL (`GROUP BY`/оконные функции). Для `/events`,
`/segment-members`, `/clients` объём растёт линейно с активностью клуба, без `LIMIT`.
**Риск.** O(n) память и CPU Node на больших периодах/клубах; всплески GC, медленные
ответы. Пока приемлемо на малых данных, но плохо масштабируется.
**Исправление.** Перенести группировки/доли в SQL (`GROUP BY`, `sum() OVER`,
`percent_rank()`); добавить `LIMIT`/пагинацию там, где выборка неограниченна.

### [P3] `netBreakdown` — 8 последовательных запросов; в `/dashboard` зовётся 2× подряд
**Файл:** `analytics.router.ts:105-206`, вызовы `319-320` (`await` подряд),
`/overview:395-411`.
**Суть.** `netBreakdown` делает 8 отдельных запросов; `/dashboard` ещё и вызывает его
дважды последовательно (`netToday`, потом `netMonth` через `await`), плюс ~10
собственных запросов выше — дашборд = ~30+ round-trip к БД на один GET, многие можно
распараллелить (`Promise.all`) или объединить (CTE/`FILTER`).
**Риск.** Латентность дашборда = сумма всех round-trip; усиливает P0 на больших данных.
**Исправление.** Параллелить независимые запросы `Promise.all`; объединять агрегаты
по `checks` в один проход с `FILTER (WHERE …)`.

### [Положительно] Мультитенантность и базовая защита — корректны
- Все 10+ хендлеров читают `const db = c.var.db`; прямого импорта/использования
  синглтона `db` из `@titan/database` в файле НЕТ (проверено grep) — чтения чужой/
  дефолтной БД не происходит.
- Роутер целиком под `requireAuth, requireRole('owner','staff')` (`:15`) — аноним и
  `tablet`/`client`/резидент отсечены (резидент-токены имеют иную роль; 403).
- `/players/:id` валидирует UUID (`:1063`); `/checks/:id` без межтенантной утечки —
  `db` уже привязан к клубу. IDOR между клубами невозможен (изоляция на уровне БД).
- Даты валидируются строгим `ISO_DATE_RE` + обратная сериализация (`:44-58`).
- N+1 в `/shifts` уже устранён (батч `inArray` + Map-сшивка, `:1123-1187`); `/checks`
  и `/shifts` используют батч-выборки — это хорошо.

---

## Возможности апгрейда

1. **Индексы под аналитику (P0).** Добавить
   `idx_checks_status_created ON checks(status, created_at)` (или частичный
   `WHERE status='closed'`), `idx_refunds_created ON refunds(created_at)`,
   `idx_salary_payments_created ON salary_payments(created_at)`,
   `idx_check_payments_method ON check_payments(method)`. Снимет seq-scan'ы с
   дашборда/обзора/revenue/payments/clients.

2. **Разделение прав + гейт модуля.** Ввести `owner`-only финблок (или право
   `analytics:finance`), вырезать ПДн (`phone`/`fullName`) и ФОТ из ответов для
   `staff`; добавить `requireModule('analytics')` на `/api/analytics/*`. Закрывает
   утечку выручки/зарплат/ПДн и обход фиче-гейта.

3. **Ретенция + батч-агрегация.** Cron-чистка `analytics_events` (90 дней) +
   отдельный rate-limit/whitelist для `/track`; перенести JS-Map-агрегации
   (`/events`, `/clients`-сегменты, `/segment-members`) в SQL и распараллелить
   `netBreakdown`/`/dashboard` (`Promise.all` + `FILTER`). Ограничит рост данных и
   уберёт O(n)-память + лишние round-trip.
