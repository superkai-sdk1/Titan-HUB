-- 043: персистентные ревизии склада.
-- Каждая ревизия — складская операция с историей: снапшот «ожидалось/факт»
-- по каждой позиции на момент проведения. Правка старой ревизии пересчитывает
-- текущий остаток на ДЕЛЬТУ (новый факт − старый факт), не перезаписывая его,
-- чтобы не потерять движения, случившиеся после ревизии.
CREATE TABLE IF NOT EXISTS revisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_by uuid REFERENCES profiles(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz
);

CREATE TABLE IF NOT EXISTS revision_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  revision_id uuid NOT NULL REFERENCES revisions(id) ON DELETE CASCADE,
  item_id uuid NOT NULL REFERENCES inventory(id),
  -- Снапшоты на момент ревизии: имя и себестоимость могут меняться позже.
  name text NOT NULL,
  expected integer NOT NULL,
  actual integer NOT NULL,
  cost_price numeric(12,2) NOT NULL DEFAULT 0,
  sort_order integer NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_revision_items_revision ON revision_items (revision_id);
CREATE INDEX IF NOT EXISTS idx_revisions_created ON revisions (created_at DESC);
