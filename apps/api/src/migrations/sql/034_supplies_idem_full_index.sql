-- Фикс: приёмки (supplies) не сохранялись — POST /supplies падал с
-- «there is no unique or exclusion constraint matching the ON CONFLICT specification».
-- Причина: 011 создал ЧАСТИЧНЫЙ уникальный индекс (WHERE idempotency_key IS NOT NULL),
-- а ON CONFLICT (idempotency_key) сопоставляется с частичным индексом только при
-- указании того же предиката; используемая версия drizzle его передать не умеет.
-- Делаем индекс ПОЛНЫМ — как у expenses/salary_payments/cash_operations (006).
-- NULL в Postgres различны → старые строки с key=NULL не конфликтуют, а повтор с тем
-- же непустым ключом по-прежнему отклоняется.
DROP INDEX IF EXISTS supplies_idempotency_key_uniq;
CREATE UNIQUE INDEX IF NOT EXISTS supplies_idempotency_key_uniq ON supplies (idempotency_key);
