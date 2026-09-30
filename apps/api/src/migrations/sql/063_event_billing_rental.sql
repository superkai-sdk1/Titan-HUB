-- 063: режим оплаты мероприятия «По ставке зоны» (billing_mode = 'rental').
--
-- Мероприятие «Титан» с зоной — это чаще всего аренда кабинки: бронь с виджета
-- обещает гостю «ставка зоны × часы, итог по факту». Раньше такое событие
-- считалось по пакетам мероприятий (event_hourly_rates) или ручной суммой, а
-- его чек шёл без зоны и не пересчитывался по времени. В режиме 'rental' чек
-- открывается с зоной события и считает аренду живым счётчиком, как обычный
-- аренда-чек кассы.
--
-- ПОЧЕМУ text + CHECK, а не ALTER TYPE ... ADD VALUE: раннер оборачивает каждый
-- файл в транзакцию, а Postgres запрещает ADD VALUE внутри транзакции (та же
-- причина, что в 012_space_types_capacity). Идемпотентно, на всех БД.

DO $$ BEGIN
  IF (SELECT data_type FROM information_schema.columns
        WHERE table_name = 'events' AND column_name = 'billing_mode') = 'USER-DEFINED' THEN
    ALTER TABLE events ALTER COLUMN billing_mode DROP DEFAULT;
    ALTER TABLE events ALTER COLUMN billing_mode TYPE text USING billing_mode::text;
    ALTER TABLE events ALTER COLUMN billing_mode SET DEFAULT 'amount';
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'events_billing_mode_check') THEN
    ALTER TABLE events ADD CONSTRAINT events_billing_mode_check
      CHECK (billing_mode IN ('amount', 'hourly', 'rental'));
  END IF;
END $$;
