-- Идемпотентность приёмок (supplies): у поставок есть денежный эффект (COGS) и
-- побочный эффект на склад, поэтому двойной клик/ретрай не должен задваивать
-- остаток и затрату. Зеркалим expenses/salary_payments (006_idempotency.sql).
-- NULL в Postgres различны → старые записи (key=NULL) не конфликтуют, а партиал-
-- индекс по NOT NULL отклоняет повторный POST с тем же ключом через ON CONFLICT.
ALTER TABLE supplies ADD COLUMN IF NOT EXISTS idempotency_key text;
CREATE UNIQUE INDEX IF NOT EXISTS supplies_idempotency_key_uniq ON supplies (idempotency_key) WHERE idempotency_key IS NOT NULL;
