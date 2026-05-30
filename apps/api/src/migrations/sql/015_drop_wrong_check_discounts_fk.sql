-- Снимаем ошибочный FK check_discounts.item_id → inventory(id) из миграции 008.
-- Семантика колагки: check_discounts.item_id хранит ID СТРОКИ ЧЕКА (check_items.id),
-- а НЕ id товара (inventory.id) — так её и пишет applyAutoDiscounts (`itemId: it.id`,
-- где it — строка checkItems) и читает computeTotals (`items.find(i => i.id === d.itemId)`).
-- FK на inventory был неверным: при срабатывании товарной авто-скидки INSERT в
-- check_discounts падал с FK violation → весь POST /checks/:id/items ловил Internal error.
-- Идемпотентно: DROP только если констрейнт существует.
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'check_discounts_item_id_fkey') THEN
    ALTER TABLE check_discounts DROP CONSTRAINT check_discounts_item_id_fkey;
  END IF;
END $$;
