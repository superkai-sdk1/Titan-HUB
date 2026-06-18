-- 061: индексы под аналитические агрегаты.
--
-- Почти каждый эндпоинт /api/analytics фильтрует «status='closed' AND created_at >= X»
-- по таблице checks. Существующие индексы ведут с shift_id / staff_id
-- (idx_checks_staff_status_created), поэтому для общего ПЕРИОДНОГО скана без
-- сотрудника/смены они не годятся → seq-scan всей checks в /overview, /revenue,
-- /payments, /products, /clients, /dashboard. Частичный индекс по created_at
-- среди ТОЛЬКО закрытых чеков компактен (открытые/отменённые в него не попадают)
-- и точно ложится под эти запросы.
--
-- ИДЕМПОТЕНТНО: CREATE INDEX IF NOT EXISTS. Применяется раннером ко всем клуб-БД.
-- БЕЗ CONCURRENTLY — в раннере миграция идёт в транзакции, что несовместимо с
-- CONCURRENTLY; обычный CREATE INDEX кратко лочит таблицу. Для текущих объёмов
-- (одноклубный прод, десятки тысяч чеков) лок незаметен; при росте до миллионов
-- строк индекс стоит создать вручную через CONCURRENTLY заранее.
CREATE INDEX IF NOT EXISTS idx_checks_closed_created
  ON checks (created_at)
  WHERE status = 'closed';

-- Возвраты теперь вычитаются из выручки по дате возврата за выбранный период
-- (см. analytics.router — net-of-refunds). Индекс по created_at ускоряет суммы
-- возвратов окна в /revenue, /overview, /dashboard, /clients.
CREATE INDEX IF NOT EXISTS idx_refunds_created
  ON refunds (created_at);

-- Финблок аналитики агрегирует ФОТ (salary_payments) за период (netBreakdown,
-- /dashboard, /staff). Индекс по дате выплаты ускоряет эти суммы.
CREATE INDEX IF NOT EXISTS idx_salary_payments_created
  ON salary_payments (created_at);

-- Примечание: analytics_events уже имеет индекс created_at (миграция 036,
-- analytics_events_created_at_idx) — ретенция (cron/analytics-retention) дешева,
-- отдельный индекс не нужен.
