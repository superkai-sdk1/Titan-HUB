-- 066: Titan Home — приложение-киоск на планшете кабинки.
--
-- • guest_feedback — оценка вечера гостем. После оплаты (или закрытия счёта
--   персоналом) киоск предлагает оценить вечер 1–5 звёздами, отметить быстрые теги
--   и оставить комментарий. Одна оценка на чек: повторная отправка с того же
--   планшета перезаписывает её. Смотрят в аналитике («Отзывы»), низкие оценки
--   приходят уведомлением (тип guest_feedback).
-- • spaces.smart_home — какие устройства Home Assistant стоят в зоне: группы света
--   и кондиционер ({ lights: [{ entityId, name }], climate: { entityId, name } }).
--   Выбирает сотрудник на самом планшете (он в одной сети с Home Assistant); адрес и
--   токен сервера Home Assistant — интеграции клуба (ha_url / ha_token, шифруются).
--
-- Идемпотентно, на всех БД клубов.

CREATE TABLE IF NOT EXISTS guest_feedback (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  check_id    uuid NOT NULL REFERENCES checks(id) ON DELETE CASCADE,
  space_id    uuid REFERENCES spaces(id) ON DELETE SET NULL,
  rating      smallint NOT NULL CHECK (rating BETWEEN 1 AND 5),
  tags        text[] NOT NULL DEFAULT '{}',
  comment     text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS guest_feedback_check_uq ON guest_feedback (check_id);
CREATE INDEX IF NOT EXISTS guest_feedback_created_idx ON guest_feedback (created_at DESC);

ALTER TABLE spaces ADD COLUMN IF NOT EXISTS smart_home jsonb;
