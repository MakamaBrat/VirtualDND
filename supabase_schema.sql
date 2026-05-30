-- supabase_schema.sql
-- Выполни в Supabase → SQL Editor → New Query
-- Если уже запускал раньше — просто добавь снизу новую таблицу kv_store

-- Профили игроков
CREATE TABLE IF NOT EXISTS profiles (
  tg_id       TEXT PRIMARY KEY,
  name        TEXT NOT NULL DEFAULT 'Странник',
  username    TEXT DEFAULT '',
  photo       TEXT DEFAULT '',
  bio         TEXT DEFAULT '',
  level       INTEGER NOT NULL DEFAULT 1,
  xp          INTEGER NOT NULL DEFAULT 0,
  energy      INTEGER NOT NULL DEFAULT 20,
  wins        INTEGER NOT NULL DEFAULT 0,
  losses      INTEGER NOT NULL DEFAULT 0,
  time_played INTEGER NOT NULL DEFAULT 0,
  rating      INTEGER NOT NULL DEFAULT 100,
  settings    JSONB DEFAULT '{"sound":true,"haptics":true,"anim":true,"lang":"ru"}',
  updated_at  TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_profiles_rating ON profiles(rating DESC);

-- Платежи Stars
CREATE TABLE IF NOT EXISTS payments (
  id                   BIGSERIAL PRIMARY KEY,
  tg_id                TEXT NOT NULL REFERENCES profiles(tg_id),
  stars                INTEGER NOT NULL,
  payload              TEXT,
  telegram_charge_id   TEXT UNIQUE,
  created_at           TIMESTAMPTZ DEFAULT now()
);

-- Реферальные связи
CREATE TABLE IF NOT EXISTS referrals (
  id          BIGSERIAL PRIMARY KEY,
  referrer_id TEXT NOT NULL,
  invited_id  TEXT NOT NULL,
  created_at  TIMESTAMPTZ DEFAULT now(),
  UNIQUE(referrer_id, invited_id)
);

-- ★ НОВОЕ: универсальное KV-хранилище (серверы, рейтинг, рефералы)
CREATE TABLE IF NOT EXISTS kv_store (
  key         TEXT PRIMARY KEY,
  value       JSONB,
  updated_at  TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_kv_store_key ON kv_store(key);
CREATE INDEX IF NOT EXISTS idx_kv_store_updated ON kv_store(updated_at DESC);

-- RLS выключен — доступ только через service_role (бэкенд)
ALTER TABLE profiles  DISABLE ROW LEVEL SECURITY;
ALTER TABLE payments  DISABLE ROW LEVEL SECURITY;
ALTER TABLE referrals DISABLE ROW LEVEL SECURITY;
ALTER TABLE kv_store  DISABLE ROW LEVEL SECURITY;
