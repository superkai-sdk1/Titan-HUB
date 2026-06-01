-- Чат между гостем (планшет кабинки) и персоналом в рамках одного визита (чека).
-- sender: 'guest' (с планшета) | 'staff' (из кассы).
CREATE TABLE IF NOT EXISTS chat_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  check_id uuid NOT NULL REFERENCES checks(id) ON DELETE CASCADE,
  space_id uuid REFERENCES spaces(id),
  sender text NOT NULL,
  sender_id uuid REFERENCES profiles(id),
  text text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS chat_messages_check_idx ON chat_messages(check_id, created_at);
