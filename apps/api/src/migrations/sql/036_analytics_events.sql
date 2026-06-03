-- Телеметрия аналитики: лёгкие UX-события (открытие раздела, смена периода,
-- открытие drill-down). Нужна, чтобы понять, какие метрики реально смотрят.
CREATE TABLE IF NOT EXISTS analytics_events (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid REFERENCES profiles(id),
  event      text NOT NULL,
  props      jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS analytics_events_created_at_idx ON analytics_events (created_at);
CREATE INDEX IF NOT EXISTS analytics_events_event_idx ON analytics_events (event);
