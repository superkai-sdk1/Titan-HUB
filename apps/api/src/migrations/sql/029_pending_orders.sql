-- Заказы гостя с планшета, ожидающие подтверждения сотрудником.
-- Гость отправляет заказ → строка pending → уведомление персоналу. Сотрудник на
-- экране чека подтверждает (позиции добавляются в чек) или отклоняет. Гость может
-- отменить свой ещё не подтверждённый заказ.
CREATE TABLE IF NOT EXISTS pending_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  check_id uuid NOT NULL REFERENCES checks(id) ON DELETE CASCADE,
  space_id uuid REFERENCES spaces(id),
  status text NOT NULL DEFAULT 'pending',
  items jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_by uuid REFERENCES profiles(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  resolved_by uuid REFERENCES profiles(id),
  resolved_at timestamptz
);

-- Быстрый поиск ожидающих заказов по чеку (баннер на экране чека / экран планшета).
CREATE INDEX IF NOT EXISTS pending_orders_check_pending_idx
  ON pending_orders(check_id) WHERE status = 'pending';
