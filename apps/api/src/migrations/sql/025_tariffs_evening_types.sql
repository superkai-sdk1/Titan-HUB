-- Стандартизация тарифов и типов вечеров.
-- Тарифы клиентов выносятся в отдельную сущность tariffs (раздел «Тарифы и аренда»),
-- с привязкой к backing-позиции меню (item_id) — через неё тариф попадает в чек как
-- обычная позиция (денежный путь не меняется). Типы вечеров — управляемый справочник
-- evening_types (без цены), shifts.evening_type переводим enum → text.

-- 1. Справочник типов вечеров.
CREATE TABLE IF NOT EXISTS evening_types (
  key text PRIMARY KEY,
  label text NOT NULL,
  color text NOT NULL DEFAULT '#8B5CF6',
  sort_order integer NOT NULL DEFAULT 0,
  is_system boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 2. Тарифы (отдельная сущность). item_id — скрытая backing-позиция меню.
CREATE TABLE IF NOT EXISTS tariffs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  price numeric(10,2) NOT NULL DEFAULT 0,
  color text NOT NULL DEFAULT '#8B5CF6',
  sort_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  item_id uuid REFERENCES inventory(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS tariffs_item_id_idx ON tariffs(item_id);

-- 3. shifts.evening_type: enum evening_type → text (идемпотентно), default 'none'.
DO $$ BEGIN
  IF (SELECT data_type FROM information_schema.columns
        WHERE table_name = 'shifts' AND column_name = 'evening_type') = 'USER-DEFINED' THEN
    ALTER TABLE shifts ALTER COLUMN evening_type DROP DEFAULT;
    ALTER TABLE shifts ALTER COLUMN evening_type TYPE text USING evening_type::text;
    ALTER TABLE shifts ALTER COLUMN evening_type SET DEFAULT 'none';
  END IF;
END $$;

-- 4. Сиды типов вечеров (none — системный «Обычный»).
INSERT INTO evening_types (key, label, color, sort_order, is_system) VALUES
  ('none',        'Обычный',          '#94A3B8', 0, true),
  ('sport_mafia', 'Спортивная мафия', '#F59E0B', 1, false),
  ('city_mafia',  'Городская мафия',  '#8B5CF6', 2, false),
  ('kids_mafia',  'Детская мафия',    '#10B981', 3, false),
  ('board_games', 'Настольные игры',  '#3B82F6', 4, false)
ON CONFLICT (key) DO NOTHING;

-- 5. Перенос существующих тарифов из меню (категория с именем ~ 'тариф') в tariffs,
--    с привязкой item_id. Только активные/не удалённые, которых ещё нет в tariffs.
INSERT INTO tariffs (name, price, item_id, sort_order, is_active)
SELECT i.name, i.price, i.id, COALESCE(i.sort_order, 0), i.is_active
FROM inventory i
JOIN menu_categories c ON c.id = i.category
WHERE lower(c.name) LIKE '%тариф%'
  AND i.deleted_at IS NULL
  AND NOT EXISTS (SELECT 1 FROM tariffs t WHERE t.item_id = i.id);
