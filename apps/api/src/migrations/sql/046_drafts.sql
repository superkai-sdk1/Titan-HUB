-- 046: черновики ревизий и поставок.
--
-- Промежуточное состояние «не проведено»: сотрудник может сохранить начатую
-- ревизию/поставку как черновик (не применяя к остаткам), выйти и вернуться позже.
-- Рабочее состояние черновика хранится в draft_data (jsonb); строки revision_items/
-- supply_items и движения склада создаются ТОЛЬКО при применении. Модель проведённых
-- документов не меняется. НЕРАЗРУШАЮЩЕ: только ADD COLUMN, существующие данные целы
-- (все текущие ревизии/поставки получают статус applied/posted).
ALTER TABLE revisions ADD COLUMN IF NOT EXISTS status     text NOT NULL DEFAULT 'applied';
ALTER TABLE revisions ADD COLUMN IF NOT EXISTS draft_data jsonb;

ALTER TABLE supplies  ADD COLUMN IF NOT EXISTS status     text NOT NULL DEFAULT 'posted';
ALTER TABLE supplies  ADD COLUMN IF NOT EXISTS draft_data jsonb;

-- Список ревизий/поставок фильтрует/сортирует с учётом статуса (черновики сверху).
CREATE INDEX IF NOT EXISTS idx_revisions_status ON revisions (status);
CREATE INDEX IF NOT EXISTS idx_supplies_status  ON supplies (status);
