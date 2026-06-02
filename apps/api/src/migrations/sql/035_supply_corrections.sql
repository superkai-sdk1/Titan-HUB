-- Корректировки проведённых закупок: аудит с обязательной причиной.
-- Каждая правка закупки (PATCH /supplies/:id) фиксируется отдельной строкой
-- (причина + сумма до/после) и показывается в карточке закупки.
CREATE TABLE IF NOT EXISTS supply_corrections (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  supply_id    uuid NOT NULL REFERENCES supplies(id) ON DELETE CASCADE,
  reason       text NOT NULL,
  total_before numeric(12,2) NOT NULL DEFAULT 0,
  total_after  numeric(12,2) NOT NULL DEFAULT 0,
  created_by   uuid REFERENCES profiles(id),
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS supply_corrections_supply_id_idx ON supply_corrections (supply_id);
