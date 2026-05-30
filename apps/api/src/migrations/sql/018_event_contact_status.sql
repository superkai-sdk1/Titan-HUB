-- Контакт заказчика + новый статус мероприятия «needs_clarification».
-- Колонки заказчика — nullable text, добавляются без сканирования.
ALTER TABLE events ADD COLUMN IF NOT EXISTS customer_name text;
ALTER TABLE events ADD COLUMN IF NOT EXISTS customer_phone text;

-- Статус: добавить значение в pgEnum нельзя внутри транзакции (раннер оборачивает
-- каждый файл в транзакцию → ALTER TYPE ... ADD VALUE даёт 25P02). Поэтому
-- конвертируем events.status из enum в text + CHECK (паттерн 012_space_types).
-- Идемпотентно: меняем тип только если он ещё enum (USER-DEFINED).
DO $$ BEGIN
  IF (SELECT data_type FROM information_schema.columns
        WHERE table_name = 'events' AND column_name = 'status') = 'USER-DEFINED' THEN
    ALTER TABLE events ALTER COLUMN status DROP DEFAULT;
    ALTER TABLE events ALTER COLUMN status TYPE text USING status::text;
    ALTER TABLE events ALTER COLUMN status SET DEFAULT 'planned';
  END IF;
END $$;

-- CHECK со всеми допустимыми статусами (идемпотентно).
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'events_status_check') THEN
    ALTER TABLE events ADD CONSTRAINT events_status_check
      CHECK (status IN ('planned', 'needs_clarification', 'active', 'completed', 'cancelled'));
  END IF;
END $$;
