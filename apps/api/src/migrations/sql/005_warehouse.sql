-- Склад: приёмка с поставщиком/единицами/свободным наименованием + журнал движений.

-- Поставщик у закупки
ALTER TABLE supplies ADD COLUMN IF NOT EXISTS supplier text;

-- Позиции закупки: свободное имя + единица; itemId опционален
-- (сырьё без отдельной карточки товара тоже можно зафиксировать как затрату).
ALTER TABLE supply_items ADD COLUMN IF NOT EXISTS name text;
ALTER TABLE supply_items ADD COLUMN IF NOT EXISTS unit text NOT NULL DEFAULT 'шт';
ALTER TABLE supply_items ALTER COLUMN item_id DROP NOT NULL;

-- Журнал движений склада (аудит ручных корректировок остатка).
CREATE TABLE IF NOT EXISTS stock_movements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id uuid NOT NULL REFERENCES inventory(id),
  delta integer NOT NULL,
  new_quantity integer NOT NULL,
  reason text,
  created_by uuid REFERENCES profiles(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_stock_movements_item ON stock_movements(item_id, created_at DESC);
