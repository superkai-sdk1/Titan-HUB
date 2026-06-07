-- Новый статус клиента «Новичок» — по умолчанию для новых клиентов.
-- «Гость» остаётся отдельной категорией. Статусы — управляемый справочник client_tiers.
INSERT INTO client_tiers (key, label, color, sort_order, is_system)
VALUES ('newbie', 'Новичок', '#22D3EE', 0, true)
ON CONFLICT (key) DO NOTHING;

-- Порядок отображения: Новичок, Гость, Резидент, Студент.
UPDATE client_tiers SET sort_order = 1 WHERE key = 'guest';
UPDATE client_tiers SET sort_order = 2 WHERE key = 'resident';
UPDATE client_tiers SET sort_order = 3 WHERE key = 'student';

-- Новые клиенты по умолчанию — «Новичок».
ALTER TABLE profiles ALTER COLUMN client_tier SET DEFAULT 'newbie';
