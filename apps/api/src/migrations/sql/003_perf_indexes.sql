-- Производительность: индексы для частых запросов

-- Чеки по смене + статусу (POS list, аналитика смены)
CREATE INDEX IF NOT EXISTS idx_checks_shift_status ON checks(shift_id, status);

-- Платежи по чеку и методу (отчёт смены)
CREATE INDEX IF NOT EXISTS idx_check_payments_check_method ON check_payments(check_id, method);

-- Активные клиенты по роли (поиск, фильтры)
CREATE INDEX IF NOT EXISTS idx_profiles_role_active ON profiles(role) WHERE deleted_at IS NULL;

-- Позиции чека (загрузка чека)
CREATE INDEX IF NOT EXISTS idx_check_items_check ON check_items(check_id);

-- События по дате + статусу
CREATE INDEX IF NOT EXISTS idx_events_date_status ON events(date, status);

-- События по пространству (для tablet active-for-space)
CREATE INDEX IF NOT EXISTS idx_events_space_status ON events(space_id, status) WHERE space_id IS NOT NULL;

-- Чеки связанные с событием (аналитика)
CREATE INDEX IF NOT EXISTS idx_checks_event ON checks(linked_event_id) WHERE linked_event_id IS NOT NULL;

-- Чеки по space (tablet, аренда)
CREATE INDEX IF NOT EXISTS idx_checks_space_status ON checks(space_id, status) WHERE space_id IS NOT NULL;

-- Bonus history по profile (история бонусов клиента)
CREATE INDEX IF NOT EXISTS idx_bonus_history_profile_created ON bonus_history(profile_id, created_at DESC);

-- Transactions по player (история транзакций)
CREATE INDEX IF NOT EXISTS idx_transactions_player_created ON transactions(player_id, created_at DESC) WHERE player_id IS NOT NULL;
