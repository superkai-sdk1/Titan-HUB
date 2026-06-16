-- Онлайн-платежи клиента из Titan Resident (СБП через эквайер клуба):
-- погашение долга / пополнение депозита / взнос в Фонд клуба. Эффект применяется
-- только при подтверждении вебхуком (settleResidentPayment), идемпотентно по status.
-- Идемпотентно: применяется и на основной БД, и на клуб-БД.
CREATE TABLE IF NOT EXISTS resident_payments (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id      uuid NOT NULL REFERENCES profiles(id),
  purpose         text NOT NULL,                 -- 'deposit' | 'debt' | 'fund'
  amount          numeric(12,2) NOT NULL,
  provider        text,
  transaction_id  text,
  collection_id   uuid,
  status          text NOT NULL DEFAULT 'pending', -- 'pending' | 'confirmed' | 'failed'
  applied_at      timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS resident_payments_profile_idx ON resident_payments (profile_id, created_at DESC);
