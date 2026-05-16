-- Миграция: исправление enum event_payment_type
-- Было: ['fixed', 'hourly']
-- Стало: ['fixed', 'per_head', 'free']
-- Стратегия: создаём новый enum, конвертируем ('hourly' → 'per_head'), сносим старый

DO $$
BEGIN
  -- Проверяем, нужна ли миграция (есть ли уже значение 'per_head')
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum e
    JOIN pg_type t ON e.enumtypid = t.oid
    WHERE t.typname = 'event_payment_type' AND e.enumlabel = 'per_head'
  ) THEN
    -- Переименовать старый тип
    ALTER TYPE event_payment_type RENAME TO event_payment_type_old;

    -- Создать новый
    CREATE TYPE event_payment_type AS ENUM ('fixed', 'per_head', 'free');

    -- Сначала убираем default (иначе ALTER COLUMN падает на дефолте старого enum)
    ALTER TABLE events ALTER COLUMN payment_type DROP DEFAULT;

    -- Конвертировать колонку: 'hourly' → 'per_head'
    ALTER TABLE events
      ALTER COLUMN payment_type TYPE event_payment_type
      USING (
        CASE payment_type::text
          WHEN 'hourly' THEN 'per_head'::event_payment_type
          WHEN 'fixed' THEN 'fixed'::event_payment_type
          ELSE 'fixed'::event_payment_type
        END
      );

    -- Вернуть default
    ALTER TABLE events ALTER COLUMN payment_type SET DEFAULT 'fixed';

    -- Снести старый enum
    DROP TYPE event_payment_type_old;
  END IF;
END $$;
