-- Внешние ключи для висячих uuid-колонок (целостность ссылок).
-- NOT VALID: НЕ сканируем существующие строки (без длинной блокировки и без
-- падения на исторических orphan-данных), но новые insert/update проверяются.
-- ON DELETE SET NULL: все колонки nullable. DO-блоки дают идемпотентность.

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'checks_certificate_id_fkey') THEN
    ALTER TABLE checks ADD CONSTRAINT checks_certificate_id_fkey
      FOREIGN KEY (certificate_id) REFERENCES certificates(id) ON DELETE SET NULL NOT VALID;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'checks_linked_event_id_fkey') THEN
    ALTER TABLE checks ADD CONSTRAINT checks_linked_event_id_fkey
      FOREIGN KEY (linked_event_id) REFERENCES events(id) ON DELETE SET NULL NOT VALID;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'check_discounts_discount_id_fkey') THEN
    ALTER TABLE check_discounts ADD CONSTRAINT check_discounts_discount_id_fkey
      FOREIGN KEY (discount_id) REFERENCES discounts(id) ON DELETE SET NULL NOT VALID;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'check_discounts_item_id_fkey') THEN
    ALTER TABLE check_discounts ADD CONSTRAINT check_discounts_item_id_fkey
      FOREIGN KEY (item_id) REFERENCES inventory(id) ON DELETE SET NULL NOT VALID;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'check_discounts_client_rule_id_fkey') THEN
    ALTER TABLE check_discounts ADD CONSTRAINT check_discounts_client_rule_id_fkey
      FOREIGN KEY (client_rule_id) REFERENCES client_discount_rules(id) ON DELETE SET NULL NOT VALID;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'cash_operations_shift_id_fkey') THEN
    ALTER TABLE cash_operations ADD CONSTRAINT cash_operations_shift_id_fkey
      FOREIGN KEY (shift_id) REFERENCES shifts(id) ON DELETE SET NULL NOT VALID;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'profiles_linked_space_id_fkey') THEN
    ALTER TABLE profiles ADD CONSTRAINT profiles_linked_space_id_fkey
      FOREIGN KEY (linked_space_id) REFERENCES spaces(id) ON DELETE SET NULL NOT VALID;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'inventory_linked_space_id_fkey') THEN
    ALTER TABLE inventory ADD CONSTRAINT inventory_linked_space_id_fkey
      FOREIGN KEY (linked_space_id) REFERENCES spaces(id) ON DELETE SET NULL NOT VALID;
  END IF;
END $$;
