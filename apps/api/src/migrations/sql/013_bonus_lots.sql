-- Лоты начислений бонусов — параллельный учёт для сгорания бонусов по сроку.
-- profiles.bonus_points остаётся балансом; лоты отслеживают, какое начисление
-- когда сгорает. expires_at NULL = бессрочно. remaining уменьшается при списании.
-- Существующие балансы лотов НЕ имеют → они никогда не сгорают (grandfathered).

CREATE TABLE IF NOT EXISTS bonus_lots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid NOT NULL REFERENCES profiles(id),
  amount numeric(12, 2) NOT NULL,
  remaining numeric(12, 2) NOT NULL,
  expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Частичный индекс: подбор активных лотов клиента, отсортированных по сроку
-- сгорания (списание FIFO + ежедневный поиск сгоревших). Только remaining > 0.
CREATE INDEX IF NOT EXISTS bonus_lots_profile_exp_idx
  ON bonus_lots (profile_id, expires_at)
  WHERE remaining > 0;
