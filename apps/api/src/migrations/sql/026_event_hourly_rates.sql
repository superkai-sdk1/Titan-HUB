-- Почасовая аренда для мероприятий: плановые часы на событии + настраиваемые
-- тарифы по числу часов (раздел «Тарифы и аренда»).

-- 1. Плановое число часов мероприятия (для billingMode=hourly).
ALTER TABLE events ADD COLUMN IF NOT EXISTS planned_hours integer;

-- 2. Тарифы почасовой аренды мероприятий: ключ — число часов, цена — за весь период.
CREATE TABLE IF NOT EXISTS event_hourly_rates (
  hours integer PRIMARY KEY,
  price numeric(10,2) NOT NULL DEFAULT 0
);

-- 3. Сиды по умолчанию: 1ч=5000, 2ч=8000, 3ч=10000, 4ч=12000, 5ч=15000, 6ч=18000.
INSERT INTO event_hourly_rates (hours, price) VALUES
  (1, 5000),
  (2, 8000),
  (3, 10000),
  (4, 12000),
  (5, 15000),
  (6, 18000)
ON CONFLICT (hours) DO NOTHING;
