-- Раздельные источники фото клиента для приоритета:
--   photo_url        — загружено сотрудником (главный приоритет)
--   tg_photo_url     — из Telegram
--   gomafia_photo_url — из GoMafia
-- Эффективное фото = COALESCE(photo_url, tg_photo_url, gomafia_photo_url).
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS tg_photo_url text;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS gomafia_photo_url text;

-- Ранее аватары GoMafia сохранялись в photo_url (общий слот) — переносим их в
-- свой слот, чтобы ручное фото имело приоритет. Аватары GoMafia хостятся на
-- vkcloud-storage по пути «/gomafia/…», ручные загрузки — в нашем хранилище.
UPDATE profiles
   SET gomafia_photo_url = photo_url, photo_url = NULL
 WHERE photo_url LIKE '%/gomafia/%';
