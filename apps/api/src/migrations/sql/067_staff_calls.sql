-- 067: push и «звонки» персоналу из Titan Home.
--
-- • app_devices — устройства приложения персонала Titan HUB (app='staff'): токен
--   обычных push (push_token; на iPhone — APNs) и токен VoIP (voip_token; iPhone —
--   PushKit) для входящего «звонка» через CallKit. VoIP-токен есть и без разрешения
--   на уведомления, поэтому push_token теперь может быть пустым.
-- • staff_alerts — эскалация: гость написал в чат или нажал «Позвать», через 30 с
--   никто из персонала не открыл чат / не прочитал вызов → «звонок» на телефоны
--   персонала. Ответил один — у остальных звонок гаснет. ack_key — одноразовый
--   ключ: телефон подтверждает ответ без авторизации (приложение может быть ещё
--   не запущено, когда звонок принят с экрана блокировки).
--
-- Идемпотентно, на всех БД клубов.

ALTER TABLE app_devices ALTER COLUMN push_token DROP NOT NULL;
ALTER TABLE app_devices ADD COLUMN IF NOT EXISTS voip_token text;
CREATE UNIQUE INDEX IF NOT EXISTS app_devices_voip_uq ON app_devices (voip_token) WHERE voip_token IS NOT NULL;

CREATE TABLE IF NOT EXISTS staff_alerts (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind             text NOT NULL,                 -- 'chat' | 'staff_call'
  check_id         uuid REFERENCES checks(id) ON DELETE CASCADE,
  space_id         uuid REFERENCES spaces(id) ON DELETE SET NULL,
  notification_id  uuid REFERENCES notifications(id) ON DELETE SET NULL,
  title            text NOT NULL,                 -- кто «звонит»: «Кабинка 3»
  body             text NOT NULL,                 -- подпись: текст сообщения / «Гость зовёт персонал»
  ack_base         text NOT NULL,                 -- https://<клуб> — куда телефон шлёт «ответил»
  ack_key          text NOT NULL,
  due_at           timestamptz NOT NULL,          -- когда звонить, если никто не прочитал
  called_at        timestamptz,
  resolved_at      timestamptz,
  resolution       text,                          -- 'read' | 'answered' | 'superseded' | 'expired'
  answered_by      text,
  club_key         text,                          -- канал SSE клуба: «звонок» Android-телефонам
  created_at       timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE staff_alerts ADD COLUMN IF NOT EXISTS club_key text;
CREATE INDEX IF NOT EXISTS staff_alerts_open_idx ON staff_alerts (due_at) WHERE resolved_at IS NULL;
