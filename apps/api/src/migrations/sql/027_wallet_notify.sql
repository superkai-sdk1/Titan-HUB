-- Клиентские уведомления в Wallet-боте: флаг включения у профиля (клиент может
-- отключить их прямо в боте). По умолчанию включены.
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS wallet_notify_enabled boolean NOT NULL DEFAULT true;
