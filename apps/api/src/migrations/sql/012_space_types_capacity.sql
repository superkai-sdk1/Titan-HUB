-- Пространства: расширяем набор типов зон (анти-кафе: столы, VR, PS5, общие зоны
-- в дополнение к кабинкам/залу) + добавляем вместимость.
--
-- ПОЧЕМУ text + CHECK, а не `ALTER TYPE space_type ADD VALUE`:
-- раннер миграций (apps/api/src/migrations/runner.ts) оборачивает КАЖДЫЙ файл в
-- транзакцию (db.transaction → sql.raw(content)). PostgreSQL запрещает
-- `ALTER TYPE ... ADD VALUE` внутри блока транзакции (ошибка 25P02/«ALTER TYPE
-- ... ADD cannot run inside a transaction block») — и `IF NOT EXISTS` это НЕ
-- обходит (он лишь подавляет ошибку «значение уже есть», а не запрет транзакции).
-- Поэтому конвертируем колонку в text + CHECK со списком всех 7 значений: даёт ту
-- же целостность на уровне БД, полностью идемпотентно и спокойно живёт в транзакции.
-- (drizzle-колонка type остаётся spaceTypeEnum — для Drizzle это просто строковый
-- тип, значения совпадают с zod-объединением, так что insert/select работают.)

-- 1. type: enum space_type → text + CHECK (7 значений).
--    Снимаем дефолт (если был), меняем тип через USING, навешиваем CHECK.
DO $$ BEGIN
  IF (SELECT data_type FROM information_schema.columns
        WHERE table_name = 'spaces' AND column_name = 'type') = 'USER-DEFINED' THEN
    ALTER TABLE spaces ALTER COLUMN type DROP DEFAULT;
    ALTER TABLE spaces ALTER COLUMN type TYPE text USING type::text;
  END IF;
END $$;

-- CHECK-ограничение (идемпотентно: создаём только если ещё нет).
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'spaces_type_check') THEN
    ALTER TABLE spaces ADD CONSTRAINT spaces_type_check
      CHECK (type IN ('small_booth', 'large_booth', 'hall', 'table', 'vr', 'ps5', 'zone'));
  END IF;
END $$;

-- 2. capacity: вместимость зоны (чел.), nullable. Колонка добавляется без
--    сканирования таблицы. Карточка пространства уже рендерит {s.capacity}.
ALTER TABLE spaces ADD COLUMN IF NOT EXISTS capacity integer;
