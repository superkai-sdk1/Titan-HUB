-- Одноразовые коды входа в кошелёк из браузера/PWA (вне Telegram Mini App).
-- PWA показывает 4-значный код → клиент шлёт его боту кошелька → бот помечает
-- строку claimed+profile_id → PWA опрашивает /auth/wallet-code/status и получает JWT.
-- Идемпотентно: применяется и на основной БД, и на клуб-БД.
CREATE TABLE IF NOT EXISTS wallet_login_codes (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code        text NOT NULL,
  ticket      uuid NOT NULL DEFAULT gen_random_uuid(),
  profile_id  uuid REFERENCES profiles(id),
  status      text NOT NULL DEFAULT 'pending',
  created_at  timestamptz NOT NULL DEFAULT now(),
  expires_at  timestamptz NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS wallet_login_codes_ticket_idx ON wallet_login_codes (ticket);
-- Поиск ботом активного кода (code + status='pending' + не истёк).
CREATE INDEX IF NOT EXISTS wallet_login_codes_code_idx ON wallet_login_codes (code) WHERE status = 'pending';
