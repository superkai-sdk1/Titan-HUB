-- 053: «Сбор средств» — сборы взносов с резидентов, не связанные с кассой.
--
-- Деньги учитываются отдельно (копилка сбора). Взнос можно списать с депозита/в
-- долг (меняет profiles.balance + transactions, видно в истории игрока) либо
-- отметить наличными/переводом/СБП мимо баланса. Взносы только у резидентов.
--
-- Прогоняется на ВСЕХ клуб-БД и основной БД — аддитивно (CREATE ... IF NOT EXISTS).
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Тема сбора
CREATE TABLE IF NOT EXISTS collections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  kind text NOT NULL DEFAULT 'recurring' CHECK (kind IN ('recurring','oneoff')),
  is_mandatory boolean NOT NULL DEFAULT true,
  default_amount numeric(12,2) NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES profiles(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Периоды сбора (recurring: 'YYYY-MM' по месяцам; oneoff: 'single')
CREATE TABLE IF NOT EXISTS collection_periods (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  collection_id uuid NOT NULL REFERENCES collections(id) ON DELETE CASCADE,
  period_key text NOT NULL,
  label text NOT NULL,
  amount numeric(12,2) NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','closed')),
  opened_at timestamptz NOT NULL DEFAULT now(),
  closed_at timestamptz
);
CREATE UNIQUE INDEX IF NOT EXISTS collection_periods_uq ON collection_periods (collection_id, period_key);

-- Факт оплаты взноса (один на период+игрок)
CREATE TABLE IF NOT EXISTS collection_contributions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  collection_id uuid NOT NULL REFERENCES collections(id) ON DELETE CASCADE,
  period_id uuid NOT NULL REFERENCES collection_periods(id) ON DELETE CASCADE,
  player_id uuid NOT NULL REFERENCES profiles(id),
  amount numeric(12,2) NOT NULL,
  method text NOT NULL CHECK (method IN ('cash','transfer','sbp','deposit','debt')),
  balance_tx_id uuid,
  note text,
  paid_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES profiles(id)
);
CREATE UNIQUE INDEX IF NOT EXISTS collection_contributions_uq ON collection_contributions (period_id, player_id);
CREATE INDEX IF NOT EXISTS collection_contributions_player_idx ON collection_contributions (player_id);

-- Персональные настройки участника: своя сумма / исключение
CREATE TABLE IF NOT EXISTS collection_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  collection_id uuid NOT NULL REFERENCES collections(id) ON DELETE CASCADE,
  player_id uuid NOT NULL REFERENCES profiles(id),
  amount_override numeric(12,2),
  excluded_until timestamptz,
  excluded_forever boolean NOT NULL DEFAULT false,
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz
);
CREATE UNIQUE INDEX IF NOT EXISTS collection_members_uq ON collection_members (collection_id, player_id);
