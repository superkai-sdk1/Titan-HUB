-- Гарантия на уровне БД: не более ОДНОЙ открытой смены одновременно (защита от
-- гонки при двойном открытии — см. openShift). Частичный уникальный индекс.
CREATE UNIQUE INDEX IF NOT EXISTS shifts_one_open ON shifts ((status)) WHERE status = 'open';
