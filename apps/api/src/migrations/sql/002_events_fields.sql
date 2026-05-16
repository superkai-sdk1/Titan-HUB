-- Миграция: добавление полей в таблицу events
--   title, space_id, per_head_amount, max_guests, attendees_count
-- Удаление old fields: check_id, hourly_rate (заменены на linkedEventId в checks)

-- 1. Добавление новых колонок (idempotent через IF NOT EXISTS)
ALTER TABLE events ADD COLUMN IF NOT EXISTS title text;
ALTER TABLE events ADD COLUMN IF NOT EXISTS space_id uuid REFERENCES spaces(id);
ALTER TABLE events ADD COLUMN IF NOT EXISTS per_head_amount numeric(10, 2);
ALTER TABLE events ADD COLUMN IF NOT EXISTS max_guests integer;
ALTER TABLE events ADD COLUMN IF NOT EXISTS attendees_count integer NOT NULL DEFAULT 0;

-- 2. Перенос данных из hourly_rate → per_head_amount (если ещё существует)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='events' AND column_name='hourly_rate') THEN
    UPDATE events SET per_head_amount = hourly_rate WHERE per_head_amount IS NULL AND hourly_rate IS NOT NULL;
    ALTER TABLE events DROP COLUMN hourly_rate;
  END IF;
END $$;

-- 3. Удаление check_id (заменено на linked_event_id в checks)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='events' AND column_name='check_id') THEN
    ALTER TABLE events DROP COLUMN check_id;
  END IF;
END $$;
