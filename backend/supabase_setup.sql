-- CorteQS Diaspora Globe — Supabase setup SQL
-- Paste this entire file into Supabase Dashboard → SQL Editor → Run.

-- ============ profiles ============
CREATE TABLE IF NOT EXISTS public.profiles (
  id          TEXT PRIMARY KEY,            -- supabase user uuid
  email       TEXT UNIQUE NOT NULL,
  name        TEXT DEFAULT '',
  picture     TEXT DEFAULT '',
  is_admin    BOOLEAN DEFAULT FALSE,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ============ pins ============
CREATE TABLE IF NOT EXISTS public.pins (
  id          TEXT PRIMARY KEY,
  type        TEXT NOT NULL CHECK (type IN ('person','business','ngo','creator','event')),
  name        TEXT NOT NULL,
  city        TEXT NOT NULL,
  hood        TEXT DEFAULT '',
  lat         DOUBLE PRECISION NOT NULL,
  lng         DOUBLE PRECISION NOT NULL,
  status      TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  user_id     TEXT REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_pins_status ON public.pins(status);
CREATE INDEX IF NOT EXISTS idx_pins_type   ON public.pins(type);

-- Backend uses SERVICE_ROLE key which bypasses RLS — no policies needed.
-- If you want to expose tables via Supabase JS directly, enable RLS + policies here.
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pins     ENABLE ROW LEVEL SECURITY;

-- ============ realtime ============
-- Enable Supabase Realtime on the pins table so frontend can listen to live INSERT/UPDATE/DELETE.
ALTER PUBLICATION supabase_realtime ADD TABLE public.pins;

-- ============ migration: drop legacy columns/tables (safe to run multiple times) ============
-- Drop legacy emergent OAuth artifacts if migrating from old schema
DROP TABLE IF EXISTS public.user_sessions;
ALTER TABLE public.profiles DROP COLUMN IF EXISTS provider;
