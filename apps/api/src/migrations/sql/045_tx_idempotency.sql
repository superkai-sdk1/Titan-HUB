-- 045: идемпотентность денежных операций по балансу клиента.
--
-- POST /clients/:id/balance менял profiles.balance без защиты от повтора — двойной
-- клик / сетевой ретрай мог задвоить депозит/долг. Добавляем ключ идемпотентности
-- на transactions: повторная операция с тем же ключом — no-op (баланс не меняется).
-- НЕРАЗРУШАЮЩЕ: только ADD COLUMN + индекс, существующие транзакции и балансы целы.
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS idempotency_key text;

-- ПОЛНЫЙ уникальный индекс (не частичный), как у supplies (миграция 034): тогда
-- ON CONFLICT (idempotency_key) находит арбитра. NULL'ы в Postgres различны, поэтому
-- существующие транзакции с NULL-ключом не конфликтуют (уникальность только по реальным ключам).
CREATE UNIQUE INDEX IF NOT EXISTS transactions_idempotency_key_uniq
  ON transactions (idempotency_key);
