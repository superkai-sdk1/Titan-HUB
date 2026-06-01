-- Отметка «прочитано» для сообщений чата: read_at заполняется, когда
-- ПРОТИВОПОЛОЖНАЯ сторона открыла чат и увидела сообщение.
ALTER TABLE chat_messages
  ADD COLUMN IF NOT EXISTS read_at timestamptz;
