-- Расходы как позиции (цена за ед. × кол-во) + новые категории «Расходники»/«Табак».
-- Категорию переводим с enum на text+CHECK: добавить значение в enum внутри
-- транзакции миграции нельзя (см. events.status), а так категории расширяются легко.

ALTER TABLE expenses ALTER COLUMN category DROP DEFAULT;
ALTER TABLE expenses ALTER COLUMN category TYPE text USING category::text;
ALTER TABLE expenses ALTER COLUMN category SET DEFAULT 'other';
ALTER TABLE expenses DROP CONSTRAINT IF EXISTS expenses_category_check;
ALTER TABLE expenses ADD CONSTRAINT expenses_category_check
  CHECK (category IN ('rent','utilities','supplies','salary','marketing','equipment','other','consumables','tobacco'));

-- Позиция расхода: цена за единицу и количество (amount = сумма позиции).
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS unit_price numeric(12,2);
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS quantity numeric(12,2);
