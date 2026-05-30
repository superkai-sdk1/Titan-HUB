-- Производительность: индексы под горячие фильтры меню/склада
-- (дополняет 003_perf_indexes.sql, 004_more_indexes.sql, 009_inventory_soft_delete.sql).
-- Все индексы частичные/IF NOT EXISTS — без перезаписи таблиц и без долгих блокировок.

-- Фильтр склада по категории (inventory.router GET /?category=...): сейчас seq-scan.
-- Запрос всегда идёт с WHERE deleted_at IS NULL [AND category = $1], поэтому частичный
-- индекс по category только среди неудалённых позиций точно ложится на план.
CREATE INDEX IF NOT EXISTS inventory_category_idx ON inventory (category) WHERE deleted_at IS NULL;

-- Публичное меню планшета (menu.router GET /public — без авторизации, дёргается при
-- каждой загрузке планшета/витрины): WHERE is_active AND is_tablet_visible AND
-- deleted_at IS NULL ORDER BY sort_order. Частичный индекс по видимым позициям
-- обслуживает и фильтр, и порядок вывода, не трогая остальные строки таблицы.
CREATE INDEX IF NOT EXISTS inventory_tablet_visible_idx ON inventory (sort_order)
  WHERE deleted_at IS NULL AND is_active AND is_tablet_visible;
