-- Возврат по способам оплаты: разбивка тендеров возврата [{method, amount}].
-- Старые возвраты (NULL) распределяются пропорционально оплате при подсчёте лимитов.
ALTER TABLE refunds ADD COLUMN IF NOT EXISTS tenders jsonb;
