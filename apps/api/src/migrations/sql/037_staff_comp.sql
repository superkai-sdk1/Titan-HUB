-- Списание на персонал/владельца: чек становится бесплатным (итог 0), но в
-- аналитике «Персонал» учитывается товарная сумма и себестоимость, «оплаченная»
-- сотрудником. staff_comp_id — потребитель (owner/staff).
ALTER TABLE checks ADD COLUMN IF NOT EXISTS staff_comp_id uuid REFERENCES profiles(id);
CREATE INDEX IF NOT EXISTS checks_staff_comp_id_idx ON checks (staff_comp_id) WHERE staff_comp_id IS NOT NULL;
