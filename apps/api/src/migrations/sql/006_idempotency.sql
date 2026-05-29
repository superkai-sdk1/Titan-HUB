-- Идемпотентность операций с деньгами: ключ + уникальный индекс.
-- NULL в Postgres различны → старые записи (key=NULL) не конфликтуют,
-- а повторный POST с тем же ключом отклоняется ON CONFLICT.
ALTER TABLE expenses        ADD COLUMN IF NOT EXISTS idempotency_key text;
ALTER TABLE salary_payments ADD COLUMN IF NOT EXISTS idempotency_key text;
ALTER TABLE cash_operations ADD COLUMN IF NOT EXISTS idempotency_key text;

CREATE UNIQUE INDEX IF NOT EXISTS expenses_idem_key_uniq        ON expenses(idempotency_key);
CREATE UNIQUE INDEX IF NOT EXISTS salary_payments_idem_key_uniq ON salary_payments(idempotency_key);
CREATE UNIQUE INDEX IF NOT EXISTS cash_operations_idem_key_uniq ON cash_operations(idempotency_key);
