-- 050: пер-клубное хранилище зашифрованных СЕКРЕТОВ заведения.
--
-- Токены ботов, AI, Platega — каждый секрет в value_enc как шифртекст
-- AES-256-GCM формата `v1:<iv>:<tag>:<cipher>` (см. apps/api/src/lib/secrets.ts).
-- Plaintext в БД НЕ хранится; наружу через API отдаётся только маска.
--
-- Прогоняется на ВСЕХ клуб-БД и основной БД — аддитивно (CREATE ... IF NOT EXISTS).
-- pgcrypto нужен для gen_random_uuid() (как в прочих таблицах проекта).
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS integrations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text NOT NULL,
  value_enc text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid
);

-- Уникальность по key: один секрет на ключ + опора для ON CONFLICT (key) DO UPDATE.
CREATE UNIQUE INDEX IF NOT EXISTS integrations_key_uq ON integrations (key);
