ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS interests text[],
  ADD COLUMN IF NOT EXISTS distance_km real;