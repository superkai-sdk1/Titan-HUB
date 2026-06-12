-- ─────────────────────────────────────────────────────────────────────────────
-- CONTROL-PLANE: инициализация реестра клубов (БД `titan_control`).
-- Прогоняется ОТДЕЛЬНЫМ раннером на control-БД (не на пер-клубных app-БД).
-- Полностью идемпотентна: CREATE ... IF NOT EXISTS, можно гонять повторно.
-- Соответствует drizzle-схеме control/schema.ts.
-- ─────────────────────────────────────────────────────────────────────────────

-- gen_random_uuid() предоставляется расширением pgcrypto.
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ─── clubs: реестр арендаторов (один клуб = одна app-БД db_name) ──────────────
-- status: active | suspended | deleted.
CREATE TABLE IF NOT EXISTS clubs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  name text NOT NULL,
  db_name text NOT NULL UNIQUE,
  subdomain text UNIQUE,
  status text NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- ─── club_modules: фиче-флаги модулей per-club ───────────────────────────────
CREATE TABLE IF NOT EXISTS club_modules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id uuid NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
  module_key text NOT NULL,
  enabled boolean NOT NULL DEFAULT true,
  CONSTRAINT club_modules_club_module_key UNIQUE (club_id, module_key)
);

-- Поиск всех модулей клуба.
CREATE INDEX IF NOT EXISTS club_modules_club_id_idx ON club_modules (club_id);

-- ─── subscriptions: подписка клуба ───────────────────────────────────────────
-- period: trial_7d | 1m | 3m | 6m | 12m. status: trial | active | expired | suspended.
CREATE TABLE IF NOT EXISTS subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id uuid NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
  plan text,
  period text,
  amount numeric(12, 2),
  currency text DEFAULT 'RUB',
  status text NOT NULL DEFAULT 'trial',
  started_at timestamptz,
  paid_until timestamptz,
  note text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Подбор подписок клуба (и поиск истекающих по paid_until).
CREATE INDEX IF NOT EXISTS subscriptions_club_id_idx ON subscriptions (club_id);
CREATE INDEX IF NOT EXISTS subscriptions_paid_until_idx ON subscriptions (paid_until);

-- ─── subscription_payments: история платежей по подписке ─────────────────────
-- method: manual | platega. platega_invoice_id — для реконсиляции онлайн-оплат.
CREATE TABLE IF NOT EXISTS subscription_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id uuid NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
  amount numeric(12, 2),
  period text,
  method text NOT NULL,
  platega_invoice_id text,
  status text,
  paid_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Подбор платежей клуба + реконсиляция по инвойсу Platega.
CREATE INDEX IF NOT EXISTS subscription_payments_club_id_idx ON subscription_payments (club_id);
CREATE INDEX IF NOT EXISTS subscription_payments_platega_invoice_idx
  ON subscription_payments (platega_invoice_id);

-- ─── superadmins: операторы платформы ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS superadmins (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  login text NOT NULL UNIQUE,
  password_hash text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ─── superadmin_passkeys: WebAuthn-ключи суперадминов ────────────────────────
CREATE TABLE IF NOT EXISTS superadmin_passkeys (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  superadmin_id uuid NOT NULL REFERENCES superadmins(id) ON DELETE CASCADE,
  credential_id text NOT NULL UNIQUE,
  public_key text NOT NULL,
  counter bigint NOT NULL DEFAULT 0,
  transports text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Подбор всех passkey суперадмина.
CREATE INDEX IF NOT EXISTS superadmin_passkeys_superadmin_id_idx
  ON superadmin_passkeys (superadmin_id);

-- ─── control_audit: аудит действий control-plane ─────────────────────────────
CREATE TABLE IF NOT EXISTS control_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor text,
  action text NOT NULL,
  target_club uuid,
  payload jsonb,
  at timestamptz NOT NULL DEFAULT now()
);

-- Лента аудита по клубу и по времени (отчёты/расследования).
CREATE INDEX IF NOT EXISTS control_audit_target_club_idx ON control_audit (target_club);
CREATE INDEX IF NOT EXISTS control_audit_at_idx ON control_audit (at);
