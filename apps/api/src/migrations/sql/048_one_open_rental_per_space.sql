-- 048: запрет двух одновременных аренд одной зоны на уровне БД.
--
-- Бэкстоп к app-guard в pos.router (POST /checks): сейчас «одна открытая аренда
-- на зону» держится только кодом. Партиальный UNIQUE индекс на checks(space_id)
-- среди открытых чеков (status='open') с непустой зоной гарантирует инвариант
-- даже при гонке/обходе guard'а — второй открытый чек на ту же зону БД отклонит.
--
-- ОПАСНОСТЬ ПРОДА: если на момент миграции в БД уже есть дубли (2+ открытых чека
-- с одинаковым space_id), CREATE UNIQUE INDEX упадёт → раннер бросит исключение →
-- API не стартует. Поэтому индекс создаётся ТОЛЬКО когда дублей нет; иначе —
-- RAISE NOTICE и пропуск (миграция НИКОГДА не падает). Владельцу нужно вручную
-- закрыть/слить дубликаты открытых аренд и пере-применить (idempotent).
--
-- Имена сверены со схемой: таблица checks; колонки status (enum check_status:
-- open/closed/cancelled), space_id (uuid, nullable) — packages/database/src/schema/checks.ts.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM checks
    WHERE status = 'open' AND space_id IS NOT NULL
    GROUP BY space_id
    HAVING count(*) > 1
  ) THEN
    -- Дублей нет — безопасно навешиваем уникальность.
    CREATE UNIQUE INDEX IF NOT EXISTS uniq_one_open_rental_per_space
      ON checks (space_id)
      WHERE status = 'open' AND space_id IS NOT NULL;
  ELSE
    -- Есть дубли открытых аренд — НЕ падаем, пропускаем создание индекса.
    -- После ручной чистки дублей миграцию можно безопасно пере-применить.
    RAISE NOTICE 'Пропуск uniq_one_open_rental_per_space: есть дубли открытых аренд (2+ открытых чека на одну зону). Закройте/слейте дубликаты и пере-примените миграцию.';
  END IF;
END $$;
