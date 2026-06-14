-- Объединение СТАТУСА клиента и ТАРИФА в одну сущность (tariffs = статусы).
-- tariffs.key — слаг статуса, на него ссылается profiles.client_tier.
-- Базовые 4 статуса: resident > student > newbie > guest (иерархия = sort_order).
ALTER TABLE tariffs ADD COLUMN IF NOT EXISTS key text;
ALTER TABLE tariffs ADD COLUMN IF NOT EXISTS is_system boolean NOT NULL DEFAULT false;
-- Один статус-ключ = один тариф (защита от дублей при сидировании).
CREATE UNIQUE INDEX IF NOT EXISTS tariffs_key_unique ON tariffs (key) WHERE key IS NOT NULL;

-- Привязываем уже существующие тарифы к базовым статусам по имени (рус. метки).
UPDATE tariffs SET key = 'resident', is_system = true WHERE key IS NULL AND lower(name) = 'резидент';
UPDATE tariffs SET key = 'student',  is_system = true WHERE key IS NULL AND lower(name) = 'студент';
UPDATE tariffs SET key = 'newbie',   is_system = true WHERE key IS NULL AND lower(name) = 'новичок';
UPDATE tariffs SET key = 'guest',    is_system = true WHERE key IS NULL AND lower(name) = 'гость';

-- Иерархия (sort_order) для базовых статусов.
UPDATE tariffs SET sort_order = 0 WHERE key = 'resident';
UPDATE tariffs SET sort_order = 1 WHERE key = 'student';
UPDATE tariffs SET sort_order = 2 WHERE key = 'newbie';
UPDATE tariffs SET sort_order = 3 WHERE key = 'guest';

-- Только 4 статуса: клиентов с прочими статусами (bronze/silver/gold/platinum и др.)
-- переводим в «Гость».
UPDATE profiles SET client_tier = 'guest'
 WHERE client_tier NOT IN ('resident', 'student', 'newbie', 'guest');

-- Правила скидок, ссылающиеся на удаляемые статусы → на «Гость» (без висячих ссылок).
UPDATE client_discount_rules SET client_tier = 'guest'
 WHERE client_tier NOT IN ('resident', 'student', 'newbie', 'guest');

-- Лишние пользовательские статусы из старого справочника удаляем (база-источник
-- теперь tariffs; системные строки client_tiers оставляем как фолбэк цветов/меток).
DELETE FROM client_tiers WHERE key NOT IN ('resident', 'student', 'newbie', 'guest');

-- Недостающие базовые статус-тарифы (напр. «Новичок») с backing-позицией создаёт
-- идемпотентный сид API при старте/первом запросе (ensureSystemStatuses).
