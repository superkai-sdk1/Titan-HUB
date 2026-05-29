-- Мягкое удаление позиций меню (inventory).
-- check_items.item_id → inventory.id (FK RESTRICT) + имя позиции не денормализовано
-- в чеках, поэтому жёсткое удаление сломало бы историю продаж. deleted_at отделяет
-- «удалено» (исключается из всех списков) от is_active (скрыто из меню, но видно в
-- управлении). Колонка nullable, добавляется без сканирования таблицы.
ALTER TABLE inventory ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

-- Частичный индекс для быстрых выборок «не удалённых» позиций.
CREATE INDEX IF NOT EXISTS inventory_not_deleted_idx ON inventory (id) WHERE deleted_at IS NULL;
