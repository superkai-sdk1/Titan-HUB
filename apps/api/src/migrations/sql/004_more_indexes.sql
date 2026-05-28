-- Дополнительные индексы под частые выборки (дополняет 003_perf_indexes.sql)

-- Возвраты по чеку (refunds.router: проверка ранее возвращённых сумм)
CREATE INDEX IF NOT EXISTS idx_refunds_check ON refunds(check_id);

-- Транзакции по чеку (история оплат/возвратов конкретного чека)
CREATE INDEX IF NOT EXISTS idx_transactions_check ON transactions(check_id) WHERE check_id IS NOT NULL;

-- Чеки по сотруднику + статусу + дате (зарплатные/кадровые отчёты)
CREATE INDEX IF NOT EXISTS idx_checks_staff_status_created ON checks(staff_id, status, created_at DESC);
