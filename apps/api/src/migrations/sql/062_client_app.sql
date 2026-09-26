-- 062: клиентское приложение Titan Resident (iOS/Android).
--
-- • app_devices — push-токены устройств (Expo Push). Общая таблица для обоих
--   приложений: app='client' (Titan Resident) и app='staff' (Titan HUB, на будущее).
-- • client_notifications — лента уведомлений клиента внутри приложения (бонусы,
--   депозит, долг, оплаты, статус, рассылки клуба). Дублирует то, что уходит push
--   и в Telegram-бот, — чтобы история не терялась при выключенных push.
-- • client_broadcasts — журнал рассылок клиентам из панели (кто, кому, сколько).
-- • wallet_login_codes — вход в приложение в одно касание: deep_code уходит в
--   диплинк t.me/<bot>?start=login_<deep_code>, бот спрашивает подтверждение с
--   именем устройства (защита от фишинга «перешли мне ссылку»).
-- • profiles — настройки уведомлений клиента: push и новости клуба.
--
-- Идемпотентно: применяется и на основной БД, и на клуб-БД.

CREATE TABLE IF NOT EXISTS app_devices (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id    uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  app           text NOT NULL DEFAULT 'client',   -- 'client' | 'staff'
  platform      text NOT NULL,                    -- 'ios' | 'android'
  push_token    text NOT NULL,
  device_name   text,
  app_version   text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  last_seen_at  timestamptz NOT NULL DEFAULT now()
);
-- Один токен = одно устройство: при входе другим аккаунтом строка переезжает.
CREATE UNIQUE INDEX IF NOT EXISTS app_devices_token_uq ON app_devices (push_token);
CREATE INDEX IF NOT EXISTS app_devices_profile_idx ON app_devices (profile_id, app);

CREATE TABLE IF NOT EXISTS client_broadcasts (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title             text NOT NULL,
  body              text NOT NULL,
  audience          text NOT NULL,                -- 'all' | 'residents' | 'debtors' | 'depositors' | 'profiles'
  channels          jsonb NOT NULL DEFAULT '{}',  -- { push: bool, telegram: bool }
  recipients_count  integer NOT NULL DEFAULT 0,
  push_count        integer NOT NULL DEFAULT 0,
  telegram_count    integer NOT NULL DEFAULT 0,
  sent_by           uuid REFERENCES profiles(id),
  created_at        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS client_broadcasts_created_idx ON client_broadcasts (created_at DESC);

CREATE TABLE IF NOT EXISTS client_notifications (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id    uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  kind          text NOT NULL,                    -- 'bonus' | 'deposit' | 'debt' | 'payment' | 'tier' | 'fund' | 'news' | 'system'
  title         text NOT NULL,
  body          text NOT NULL,
  meta          jsonb NOT NULL DEFAULT '{}',
  broadcast_id  uuid REFERENCES client_broadcasts(id) ON DELETE SET NULL,
  is_read       boolean NOT NULL DEFAULT false,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS client_notifications_profile_idx ON client_notifications (profile_id, created_at DESC);
CREATE INDEX IF NOT EXISTS client_notifications_unread_idx ON client_notifications (profile_id) WHERE is_read = false;

ALTER TABLE wallet_login_codes ADD COLUMN IF NOT EXISTS deep_code text;
ALTER TABLE wallet_login_codes ADD COLUMN IF NOT EXISTS device_name text;
ALTER TABLE wallet_login_codes ADD COLUMN IF NOT EXISTS platform text;
CREATE UNIQUE INDEX IF NOT EXISTS wallet_login_codes_deep_code_uq ON wallet_login_codes (deep_code) WHERE deep_code IS NOT NULL;

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS client_push_enabled boolean NOT NULL DEFAULT true;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS client_news_enabled boolean NOT NULL DEFAULT true;
