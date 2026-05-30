-- Заказчики мероприятий — отдельный справочник контактов (имя + телефон),
-- независим от profiles/клиентов. Используется для автоподбора при планировании
-- событий и управляется на экране /manage/customers.
CREATE TABLE IF NOT EXISTS customers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text,
  phone text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Индекс под поиск по телефону (точное/префиксное совпадение при автоподборе).
CREATE INDEX IF NOT EXISTS customers_phone_idx ON customers (phone);
