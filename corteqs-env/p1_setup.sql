-- CorteQS Diaspora Globe — P1 features one-time setup
-- Paste this entire block into Supabase Dashboard → SQL Editor → Run.

-- 1) Extend pins schema for image + description
ALTER TABLE public.pins ADD COLUMN IF NOT EXISTS image_url   TEXT DEFAULT '';
ALTER TABLE public.pins ADD COLUMN IF NOT EXISTS description TEXT DEFAULT '';

-- 2) Storage bucket for pin images (public read)
INSERT INTO storage.buckets (id, name, public)
VALUES ('pin-images', 'pin-images', true)
ON CONFLICT (id) DO UPDATE SET public = true;

-- 3) Storage policy: anyone can READ from pin-images bucket
DROP POLICY IF EXISTS "Public read pin images" ON storage.objects;
CREATE POLICY "Public read pin images" ON storage.objects
  FOR SELECT
  TO public
  USING (bucket_id = 'pin-images');
