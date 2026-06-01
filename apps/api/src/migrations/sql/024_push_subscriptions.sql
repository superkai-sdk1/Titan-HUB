-- Web Push подписки браузеров/устройств для PWA-уведомлений.
-- Одна строка = один push endpoint (привязан к userId). При повторной подписке
-- того же endpoint обновляются userId + ключи (см. POST /push/subscribe).
--
-- Идемпотентно: CREATE TABLE IF NOT EXISTS + уникальный индекс по endpoint
-- (для ON CONFLICT (endpoint) DO UPDATE).
CREATE TABLE IF NOT EXISTS push_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES profiles(id),
  endpoint text NOT NULL,
  p256dh text NOT NULL,
  auth text NOT NULL,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS push_subscriptions_endpoint_uq ON push_subscriptions (endpoint);
CREATE INDEX IF NOT EXISTS push_subscriptions_user_id_idx ON push_subscriptions (user_id);
