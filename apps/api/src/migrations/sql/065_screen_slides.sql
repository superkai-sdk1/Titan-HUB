-- 065: реклама на экране меню (/menu, AbleSign).
--
-- Слайды крутятся в области ленты «Игровой вечер / Кабинки» с переворотом панели:
-- лента → слайд → слайд → лента… Слайд — картинка (image_url) или карточка
-- (title + body, QR по link_url). Настраивается владельцем в «Настройках» HUB.
-- Идемпотентно, на всех БД клубов.

CREATE TABLE IF NOT EXISTS screen_slides (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL DEFAULT 'image',
  image_url text,
  title text,
  body text,
  link_url text,
  duration_sec integer NOT NULL DEFAULT 10,
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'screen_slides_kind_check') THEN
    ALTER TABLE screen_slides ADD CONSTRAINT screen_slides_kind_check CHECK (kind IN ('image', 'card'));
  END IF;
END $$;
