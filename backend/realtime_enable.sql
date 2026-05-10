-- CorteQS Diaspora Globe — Enable Realtime + RLS read policy for pins (one-time)
-- Paste this entire file into Supabase SQL Editor and Run.

-- 1) Enable realtime broadcasts on pins INSERT/UPDATE/DELETE
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

-- 2) Allow anon + authenticated to SELECT approved pins (required so realtime delivers events to listeners)
DROP POLICY IF EXISTS "anyone reads approved pins" ON public.pins;
CREATE POLICY "anyone reads approved pins" ON public.pins
  FOR SELECT
  USING (status = 'approved');
