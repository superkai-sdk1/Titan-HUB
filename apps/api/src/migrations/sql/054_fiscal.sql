-- 054: учёт фискализации чеков 54-ФЗ через внешние кассы/ОФД (АТОЛ Онлайн и др.).
--
-- Один ряд на чек. Фоновый воркер (cron/fiscalize.ts) сканирует недавно закрытые
-- чеки клуба, отправляет фискальный чек активному провайдеру и пишет сюда статус.
-- НЕ трогает денежные пути закрытия чека (/pay, вебхуки) → нулевой риск для продаж.
-- Аддитивно (CREATE ... IF NOT EXISTS), прогоняется на всех клуб-БД и основной.
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS fiscal_receipts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  check_id uuid NOT NULL,
  provider text NOT NULL,
  status text NOT NULL DEFAULT 'pending', -- pending | sent | failed
  external_id text,                        -- идентификатор операции у провайдера
  attempts integer NOT NULL DEFAULT 0,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Один чек — один фискальный ряд (опора для ON CONFLICT (check_id) DO UPDATE).
CREATE UNIQUE INDEX IF NOT EXISTS fiscal_receipts_check_uq ON fiscal_receipts (check_id);
CREATE INDEX IF NOT EXISTS fiscal_receipts_status_idx ON fiscal_receipts (status);
