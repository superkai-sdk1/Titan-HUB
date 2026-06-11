-- 044: склад как immutable ledger движений (единый источник истины).
--
-- Раньше stock_movements был лишь частичным аудитом, а остаток
-- (inventory.stock_quantity) правился вразнобой в POS/поставках/ревизии.
-- Теперь любое изменение остатка проходит через recordMovement() и порождает
-- строку журнала. Остаток и cost_price (WAC) остаются материализованным кэшом.
--
-- НЕРАЗРУШАЮЩАЯ миграция: существующие движения, остатки (inventory.stock_quantity)
-- и чеки СОХРАНЯЮТСЯ. Таблица движений расширяется ALTER-ом (без DROP), старые
-- строки бэкфилятся, журнал до-засевается так, чтобы SUM(delta) сошёлся с остатком.

-- 1. Расширяем журнал движений новыми колонками ---------------------------------
ALTER TABLE stock_movements ADD COLUMN IF NOT EXISTS type        text;
ALTER TABLE stock_movements ADD COLUMN IF NOT EXISTS qty_after   integer;
ALTER TABLE stock_movements ADD COLUMN IF NOT EXISTS unit_cost   numeric(12,2);
ALTER TABLE stock_movements ADD COLUMN IF NOT EXISTS source_type text;
ALTER TABLE stock_movements ADD COLUMN IF NOT EXISTS source_id   uuid;
ALTER TABLE stock_movements ADD COLUMN IF NOT EXISTS note        text;

-- 2. Бэкфилл по существующим строкам --------------------------------------------
-- qty_after берём из старого new_quantity (там и был остаток после движения).
UPDATE stock_movements SET qty_after = new_quantity WHERE qty_after IS NULL;

-- Тип движения восстанавливаем по тексту причины (так писались reason'ы).
UPDATE stock_movements SET type = CASE
  WHEN reason ILIKE 'Продажа%'                              THEN 'sale'
  WHEN reason ILIKE 'Приёмка%'                              THEN 'receipt'
  WHEN reason ILIKE 'Возврат%' OR reason ILIKE 'Отмена%'    THEN 'return'
  WHEN reason ILIKE 'Ревизия%' OR reason ILIKE 'Корректировка ревизии%' THEN 'count'
  WHEN reason ILIKE 'Откат закупки%' OR reason ILIKE 'Корректировка закупки%' THEN 'adjustment'
  ELSE 'adjustment'
END
WHERE type IS NULL;

-- 3. Фиксируем NOT NULL + CHECK на тип ------------------------------------------
ALTER TABLE stock_movements ALTER COLUMN type      SET NOT NULL;
ALTER TABLE stock_movements ALTER COLUMN qty_after SET NOT NULL;
ALTER TABLE stock_movements DROP CONSTRAINT IF EXISTS stock_movements_type_check;
ALTER TABLE stock_movements ADD  CONSTRAINT stock_movements_type_check CHECK (type IN
  ('opening','receipt','sale','return','adjustment','write_off','count','transfer'));

-- 4. Удаляем устаревшую колонку new_quantity (заменена на qty_after) -------------
-- recordMovement её не пишет; new_quantity была NOT NULL без default → оставить
-- нельзя (новые INSERT'ы упали бы). Ничто её больше не читает.
ALTER TABLE stock_movements DROP COLUMN IF EXISTS new_quantity;

-- 5. Индексы: лента по товару, фильтр по типу/дате, связь с документом-источником
CREATE INDEX IF NOT EXISTS idx_stock_movements_item   ON stock_movements (item_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_stock_movements_type   ON stock_movements (type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_stock_movements_source ON stock_movements (source_type, source_id)
  WHERE source_id IS NOT NULL;

-- 6. Параметры пополнения на карточке товара ------------------------------------
ALTER TABLE inventory ADD COLUMN IF NOT EXISTS reorder_point integer;
ALTER TABLE inventory ADD COLUMN IF NOT EXISTS par_level     integer;

-- 7. Сверка журнала с остатками -------------------------------------------------
-- Старый журнал был неполным (часть остатков выставлялась без движения, история
-- truncate'илась при запуске). Для каждого учётного товара, где сумма движений не
-- сходится с текущим остатком, добавляем ОДНО открывающее движение на разницу,
-- датированное ДО первого реального движения — чтобы SUM(delta) == stock_quantity,
-- не искажая существующую историю. Остаток (stock_quantity) НЕ меняется.
INSERT INTO stock_movements (item_id, type, delta, qty_after, reason, created_at)
SELECT i.id, 'opening', calc.b, calc.b, 'Открывающий остаток',
       COALESCE(m.min_created, i.created_at) - interval '1 millisecond'
FROM inventory i
LEFT JOIN (
  SELECT item_id, SUM(delta) AS sumdelta, MIN(created_at) AS min_created
  FROM stock_movements GROUP BY item_id
) m ON m.item_id = i.id
CROSS JOIN LATERAL (SELECT (i.stock_quantity - COALESCE(m.sumdelta, 0)) AS b) calc
WHERE i.track_stock = true AND i.deleted_at IS NULL AND calc.b <> 0;
