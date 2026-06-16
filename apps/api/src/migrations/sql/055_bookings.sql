-- 055: онлайн-бронирование зон (публичный виджет → бронь → подтверждение → мероприятие).
--
-- Бронь приходит из публичной формы /book (гость без авторизации) со статусом
-- 'new'; владелец/сотрудник подтверждает (→ создаётся planned-мероприятие, event_id)
-- или отменяет. space_id — желаемая зона (опц.). Аддитивно, на всех БД.
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS bookings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  space_id uuid REFERENCES spaces(id),
  name text NOT NULL,
  phone text NOT NULL,
  guests integer,
  starts_at timestamptz NOT NULL,
  duration_hours numeric(4,1),
  comment text,
  status text NOT NULL DEFAULT 'new',   -- new | confirmed | cancelled | done
  source text NOT NULL DEFAULT 'widget', -- widget | manual
  event_id uuid,                          -- созданное мероприятие при подтверждении
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS bookings_status_idx ON bookings (status);
CREATE INDEX IF NOT EXISTS bookings_starts_idx ON bookings (starts_at);
