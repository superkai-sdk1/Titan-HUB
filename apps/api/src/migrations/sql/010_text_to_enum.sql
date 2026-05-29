-- Конвертация «отстающих» text-колонок в существующие enum-типы (целостность на
-- уровне БД). Все целевые типы уже созданы (discount_type, client_tier,
-- payment_method — из таблиц checks/profiles). Все 4 таблицы на момент миграции
-- пустые, поэтому USING-каст тривиален и блокировка мгновенна.
--
-- Идемпотентность: каждый ALTER выполняется только если колонка ещё text
-- (data_type='text'); enum-колонка имеет data_type='USER-DEFINED' → пропуск.
-- Для колонок с DEFAULT сначала снимаем default (его text-литерал не кастуется
-- автоматически при смене типа), затем меняем тип, затем возвращаем default.

-- discounts.type → discount_type ('percent','fixed'); без default
DO $$ BEGIN
  IF (SELECT data_type FROM information_schema.columns
        WHERE table_name = 'discounts' AND column_name = 'type') = 'text' THEN
    ALTER TABLE discounts ALTER COLUMN type TYPE discount_type USING type::discount_type;
  END IF;
END $$;

-- client_discount_rules.client_tier → client_tier ('guest','resident','student'); без default
DO $$ BEGIN
  IF (SELECT data_type FROM information_schema.columns
        WHERE table_name = 'client_discount_rules' AND column_name = 'client_tier') = 'text' THEN
    ALTER TABLE client_discount_rules ALTER COLUMN client_tier TYPE client_tier USING client_tier::client_tier;
  END IF;
END $$;

-- supplies.payment_method → payment_method; default 'cash'
DO $$ BEGIN
  IF (SELECT data_type FROM information_schema.columns
        WHERE table_name = 'supplies' AND column_name = 'payment_method') = 'text' THEN
    ALTER TABLE supplies ALTER COLUMN payment_method DROP DEFAULT;
    ALTER TABLE supplies ALTER COLUMN payment_method TYPE payment_method USING payment_method::payment_method;
    ALTER TABLE supplies ALTER COLUMN payment_method SET DEFAULT 'cash';
  END IF;
END $$;

-- salary_payments.payment_method → payment_method; default 'cash'
DO $$ BEGIN
  IF (SELECT data_type FROM information_schema.columns
        WHERE table_name = 'salary_payments' AND column_name = 'payment_method') = 'text' THEN
    ALTER TABLE salary_payments ALTER COLUMN payment_method DROP DEFAULT;
    ALTER TABLE salary_payments ALTER COLUMN payment_method TYPE payment_method USING payment_method::payment_method;
    ALTER TABLE salary_payments ALTER COLUMN payment_method SET DEFAULT 'cash';
  END IF;
END $$;
