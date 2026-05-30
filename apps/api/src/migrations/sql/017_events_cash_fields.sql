-- Мероприятия как кассовая операция: ответственный сотрудник, гибкий режим
-- списания (amount/hourly), ручная сумма, привязка к чеку; + база события на чеке.
-- Новый enum создаётся через CREATE TYPE (это разрешено внутри транзакции, в
-- отличие от ALTER TYPE ... ADD VALUE). Все колонки nullable/с дефолтом → без
-- сканирования таблиц. Идемпотентно (IF NOT EXISTS / DO-guard для типа).

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'event_billing_mode') THEN
    CREATE TYPE event_billing_mode AS ENUM ('amount', 'hourly');
  END IF;
END $$;

ALTER TABLE events ADD COLUMN IF NOT EXISTS billing_mode event_billing_mode NOT NULL DEFAULT 'amount';
ALTER TABLE events ADD COLUMN IF NOT EXISTS manual_amount numeric(10,2);
ALTER TABLE events ADD COLUMN IF NOT EXISTS responsible_staff_id uuid REFERENCES profiles(id);
ALTER TABLE events ADD COLUMN IF NOT EXISTS check_id uuid;

ALTER TABLE checks ADD COLUMN IF NOT EXISTS event_base_amount numeric(12,2);
