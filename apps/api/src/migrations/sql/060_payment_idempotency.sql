-- 060: БД-инвариант идемпотентности платежей (защита от двойного зачисления).
--
-- До этой миграции защита от повторного применения вебхука держалась только на
-- app-level (SELECT ... FOR UPDATE + проверка status). При гонке/ретрае/ручной
-- правке статуса оставался риск задвоения проводки. Добавляем БД-уникальность.
--
-- ИДЕМПОТЕНТНО: только CREATE UNIQUE INDEX IF NOT EXISTS, частичные (WHERE ... IS
-- NOT NULL) — на исторических строках с NULL-tx инвариант не навязывается, дубли
-- по NULL не блокируются. Применяется на всех клуб-БД раннером миграций.
--
-- БЕЗОПАСНОСТЬ ДЕПЛОЯ: уникальный индекс на ИСТОРИЧЕСКИХ дублях упал бы и (т.к.
-- раннер фатален для основной БД) уронил бы старт API. Поэтому создаём индекс
-- ТОЛЬКО если дублей нет; при наличии дублей — пропускаем с NOTICE (app-level
-- защита остаётся), чтобы деплой НЕ ломался. После ручной чистки дублей индекс
-- до-создастся повторным прогоном этой же миграции (она помечается применённой,
-- поэтому для до-создания индекс нужно будет создать вручную либо временно снять
-- запись из _migrations — см. README провижининга).

-- resident_payments: одна (provider, transaction_id) применяется ровно один раз.
-- Колонки: provider text, transaction_id text (см. 059_resident_payments.sql).
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM resident_payments
    WHERE transaction_id IS NOT NULL
    GROUP BY provider, transaction_id
    HAVING count(*) > 1
  ) THEN
    RAISE NOTICE 'resident_payments: найдены дубли (provider,transaction_id) — uniq-индекс ПРОПУЩЕН. Почистите данные и создайте индекс вручную.';
  ELSE
    CREATE UNIQUE INDEX IF NOT EXISTS uniq_resident_payments_provider_tx
      ON resident_payments (provider, transaction_id)
      WHERE transaction_id IS NOT NULL;
  END IF;
END $$;

-- checks: одна подтверждённая транзакция эквайера (platega_tx_id) закрывает ровно
-- один чек — нельзя привязать ту же tx к двум чекам. Колонка platega_tx_id text
-- (см. 033_platega_tx_id.sql) заполняется в settle при закрытии чека по СБП.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM checks
    WHERE platega_tx_id IS NOT NULL
    GROUP BY platega_tx_id
    HAVING count(*) > 1
  ) THEN
    RAISE NOTICE 'checks: найдены дубли platega_tx_id — uniq-индекс ПРОПУЩЕН. Почистите данные и создайте индекс вручную.';
  ELSE
    CREATE UNIQUE INDEX IF NOT EXISTS uniq_checks_platega_tx
      ON checks (platega_tx_id)
      WHERE platega_tx_id IS NOT NULL;
  END IF;
END $$;
