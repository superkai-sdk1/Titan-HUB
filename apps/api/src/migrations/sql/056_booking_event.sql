-- 056: расширение брони до клиентского конструктора мероприятия.
--
-- location — Штаб Titan ('titan') или выезд ('exit'); address — для выезда;
-- tariff_hours — выбранный тариф (число часов из event_hourly_rates);
-- claim_token — секрет для «узнавания» клиента (повторное открытие ссылки в том же
-- браузере: статус брони + правки без авторизации). Аддитивно, на всех БД.
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS location text;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS address text;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS tariff_hours integer;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS claim_token text;

CREATE INDEX IF NOT EXISTS bookings_claim_idx ON bookings (claim_token);
