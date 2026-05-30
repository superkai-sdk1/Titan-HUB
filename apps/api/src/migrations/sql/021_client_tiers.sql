-- Статусы клиентов (client_tier) становятся управляемым справочником: владелец
-- может создавать/удалять статусы. Поэтому profiles.client_tier из enum переводим
-- в text БЕЗ CHECK (значения теперь динамические, живут в таблице client_tiers).
--
-- Почему так, а не ALTER TYPE ADD VALUE: раннер оборачивает файл в транзакцию,
-- а ALTER TYPE ... ADD VALUE в транзакции запрещён. text без CHECK позволяет любой
-- ключ статуса. Сам enum client_tier НЕ трогаем — он ещё используется колонкой
-- client_discount_rules.client_tier (скидки по статусам — отдельная история).
-- Для Drizzle колонка остаётся строковой, insert/select работают как прежде.

-- 1. profiles.client_tier: enum client_tier → text (идемпотентно).
DO $$ BEGIN
  IF (SELECT data_type FROM information_schema.columns
        WHERE table_name = 'profiles' AND column_name = 'client_tier') = 'USER-DEFINED' THEN
    ALTER TABLE profiles ALTER COLUMN client_tier DROP DEFAULT;
    ALTER TABLE profiles ALTER COLUMN client_tier TYPE text USING client_tier::text;
    ALTER TABLE profiles ALTER COLUMN client_tier SET DEFAULT 'guest';
  END IF;
END $$;

-- 1b. client_discount_rules.client_tier: enum → text (правила скидок по статусам
--     тоже должны принимать любой динамический статус, иначе сравнение enum=text
--     с кастомным значением падает в рантайме).
DO $$ BEGIN
  IF (SELECT data_type FROM information_schema.columns
        WHERE table_name = 'client_discount_rules' AND column_name = 'client_tier') = 'USER-DEFINED' THEN
    ALTER TABLE client_discount_rules ALTER COLUMN client_tier TYPE text USING client_tier::text;
  END IF;
END $$;

-- 2. Справочник статусов.
CREATE TABLE IF NOT EXISTS client_tiers (
  key text PRIMARY KEY,
  label text NOT NULL,
  color text NOT NULL DEFAULT '#8B5CF6',
  sort_order integer NOT NULL DEFAULT 0,
  is_system boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 3. Сиды. Базовые guest/resident/student — системные (не удаляются). Остальные
--    (bronze/silver/gold/platinum) уже были в UI — заводим как обычные (удаляемые).
INSERT INTO client_tiers (key, label, color, sort_order, is_system) VALUES
  ('guest',    'Гость',    'rgba(204,195,216,0.6)', 0, true),
  ('resident', 'Резидент', '#8B5CF6',               1, true),
  ('student',  'Студент',  '#3B82F6',               2, true),
  ('bronze',   'Бронза',   '#cd7f32',               3, false),
  ('silver',   'Серебро',  '#94A3B8',               4, false),
  ('gold',     'Золото',   '#F59E0B',               5, false),
  ('platinum', 'Платина',  '#E2E8F0',               6, false)
ON CONFLICT (key) DO NOTHING;
