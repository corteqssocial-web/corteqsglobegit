-- CorteQS Diaspora Globe — Supabase setup SQL
-- Paste this entire file into Supabase Dashboard → SQL Editor → Run.

-- ============ profiles ============
CREATE TABLE IF NOT EXISTS public.profiles (
  id          TEXT PRIMARY KEY,            -- supabase user uuid OR emergent id
  email       TEXT UNIQUE NOT NULL,
  name        TEXT DEFAULT '',
  picture     TEXT DEFAULT '',
  provider    TEXT DEFAULT 'supabase',     -- supabase | emergent
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

-- ============ user_sessions (for Emergent OAuth) ============
CREATE TABLE IF NOT EXISTS public.user_sessions (
  session_token  TEXT PRIMARY KEY,
  user_id        TEXT NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  expires_at     TIMESTAMPTZ NOT NULL,
  created_at     TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON public.user_sessions(user_id);

-- Backend uses SERVICE_ROLE key which bypasses RLS — no policies needed.
-- If you want to expose tables via Supabase JS directly, enable RLS + policies here.
ALTER TABLE public.profiles      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pins          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_sessions ENABLE ROW LEVEL SECURITY;
