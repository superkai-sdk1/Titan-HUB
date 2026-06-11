-- 042: индекс для истории чеков клиента.
-- /auth/me/* фильтрует checks по player_id (см. auth.router.ts) — единственный
-- горячий путь без индекса (staff/space/shift/event уже покрыты в прошлых миграциях).
-- Partial: player_id есть не у всех чеков (гостевые), индексируем только заполненные.
CREATE INDEX IF NOT EXISTS idx_checks_player ON checks (player_id) WHERE player_id IS NOT NULL;
