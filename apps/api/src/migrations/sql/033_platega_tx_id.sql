-- Реконсиляция платёж→чек: сохраняем id подтверждённой транзакции Platega на чеке
-- (аудит/сверка СБП-оплат). Заполняется в webhook при закрытии чека.
ALTER TABLE checks ADD COLUMN IF NOT EXISTS platega_tx_id text;
