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
  description TEXT DEFAULT '',
  image_url   TEXT DEFAULT '',
  location_label TEXT,
  canonical_city TEXT,
  country_code TEXT,
  provider    TEXT,
  provider_id TEXT,
  visibility  TEXT NOT NULL DEFAULT 'public' CHECK (visibility IN ('public', 'private')),
  status      TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  rejection_reason TEXT DEFAULT '',
  approved_at TIMESTAMPTZ,
  approved_by TEXT,
  user_id     TEXT REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_pins_status ON public.pins(status);
CREATE INDEX IF NOT EXISTS idx_pins_type   ON public.pins(type);
CREATE INDEX IF NOT EXISTS idx_pins_visibility ON public.pins(visibility);
CREATE INDEX IF NOT EXISTS idx_pins_user_id ON public.pins(user_id);

ALTER TABLE public.pins ADD COLUMN IF NOT EXISTS location_label TEXT;
ALTER TABLE public.pins ADD COLUMN IF NOT EXISTS canonical_city TEXT;
ALTER TABLE public.pins ADD COLUMN IF NOT EXISTS country_code TEXT;
ALTER TABLE public.pins ADD COLUMN IF NOT EXISTS provider TEXT;
ALTER TABLE public.pins ADD COLUMN IF NOT EXISTS provider_id TEXT;
ALTER TABLE public.pins ADD COLUMN IF NOT EXISTS description TEXT DEFAULT '';
ALTER TABLE public.pins ADD COLUMN IF NOT EXISTS image_url TEXT DEFAULT '';
ALTER TABLE public.pins ADD COLUMN IF NOT EXISTS visibility TEXT DEFAULT 'public';
ALTER TABLE public.pins ADD COLUMN IF NOT EXISTS rejection_reason TEXT DEFAULT '';
ALTER TABLE public.pins ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ;
ALTER TABLE public.pins ADD COLUMN IF NOT EXISTS approved_by TEXT;
ALTER TABLE public.pins ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

UPDATE public.pins SET visibility = 'public' WHERE visibility IS NULL;
UPDATE public.pins SET rejection_reason = '' WHERE rejection_reason IS NULL;
UPDATE public.pins SET updated_at = created_at WHERE updated_at IS NULL;

-- Backend uses SERVICE_ROLE key which bypasses RLS — no policies needed.
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pins     ENABLE ROW LEVEL SECURITY;

-- ============ realtime ============
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'pins'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.pins;
  END IF;
END $$;

-- ============ migration: drop obsolete auth artifacts ============
DROP TABLE IF EXISTS public.user_sessions;
ALTER TABLE public.profiles DROP COLUMN IF EXISTS provider;
