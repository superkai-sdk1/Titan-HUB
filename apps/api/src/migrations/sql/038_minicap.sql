-- Миникап: новый формат мероприятия с ростером участников, взносом за участие,
-- расходами (приз/обед/иные) и индивидуальными чеками. Всё аддитивно/идемпотентно.

-- Формат события: 'regular' (titan/exit) | 'minicap'. Не трогаем enum type.
ALTER TABLE events ADD COLUMN IF NOT EXISTS format text NOT NULL DEFAULT 'regular';
-- Стоимость участия (добавляется вместо тарифа каждому игроку) и расходы миникапа.
ALTER TABLE events ADD COLUMN IF NOT EXISTS participation_fee numeric(12,2);
ALTER TABLE events ADD COLUMN IF NOT EXISTS prize_fund numeric(12,2);
ALTER TABLE events ADD COLUMN IF NOT EXISTS lunch_cost numeric(12,2);
ALTER TABLE events ADD COLUMN IF NOT EXISTS other_cost numeric(12,2);

-- Заранее «внесённая» часть чека: на экране оплаты вычитается из остатка, но при
-- закрытии входит в пробиваемый итог (авто-пробивается наличными). Общий механизм.
ALTER TABLE checks ADD COLUMN IF NOT EXISTS prepaid_amount numeric(12,2) NOT NULL DEFAULT 0;

-- Привязка расхода к мероприятию (приз/обед/иные расходы миникапа).
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS event_id uuid REFERENCES events(id);

-- Ростер участников миникапа (игроки + судья). check_id — индивидуальный чек.
CREATE TABLE IF NOT EXISTS event_participants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  profile_id uuid NOT NULL REFERENCES profiles(id),
  role text NOT NULL DEFAULT 'player',
  prepaid boolean NOT NULL DEFAULT false,
  check_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (event_id, profile_id)
);
CREATE INDEX IF NOT EXISTS idx_event_participants_event ON event_participants(event_id);
