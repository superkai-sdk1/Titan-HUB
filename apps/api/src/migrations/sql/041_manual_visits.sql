-- Ручные «виртуальные» посещения: рост Новичок→Резидент можно начислять/снимать
-- вручную, без влияния на кассу. Учитываются в countVisits вместе с чек-визитами.
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS manual_visits integer NOT NULL DEFAULT 0;

-- transaction_type: enum→text+CHECK (ADD VALUE в транзакции миграции нельзя),
-- добавляем тип 'visit_adjust' — запись о корректировке посещений в истории
-- клиента (деньги/баланс/касса не затрагиваются).
ALTER TABLE transactions ALTER COLUMN type TYPE text USING type::text;
ALTER TABLE transactions DROP CONSTRAINT IF EXISTS transactions_type_check;
ALTER TABLE transactions ADD CONSTRAINT transactions_type_check
  CHECK (type IN ('deposit','withdrawal','payment','refund','bonus_accrual','bonus_spend','visit_adjust'));
