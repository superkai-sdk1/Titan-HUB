-- 064: «Показывать на экране ТВ» — экран меню /menu (AbleSign).
--
-- Флаг на позиции меню (в т.ч. backing-позиции тарифов) и на зоне (почасовая ставка
-- кабинки). По умолчанию true: всё, что уже включено в меню, остаётся на экране;
-- владелец убирает лишнее кнопкой-телевизором в «Меню» и «Тарифах и аренде».
-- Идемпотентно, на всех БД клубов.

ALTER TABLE inventory ADD COLUMN IF NOT EXISTS is_screen_visible boolean NOT NULL DEFAULT true;
ALTER TABLE spaces ADD COLUMN IF NOT EXISTS is_screen_visible boolean NOT NULL DEFAULT true;
