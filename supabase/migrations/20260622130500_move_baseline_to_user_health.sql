-- R4: Privatize heart-rate baseline by moving it from the public-readable
-- profiles table into an owner-only user_health table.
--
-- profiles is visible to all authenticated users (for discovery).
-- baseline_mean / baseline_std are biometric — only the owner should read them.

-- 1. Create the new owner-only table.
CREATE TABLE IF NOT EXISTS public.user_health (
  user_id     uuid        PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  baseline_mean numeric,
  baseline_std  numeric,
  updated_at  timestamptz NOT NULL DEFAULT now()
);

-- 2. Enable RLS.
ALTER TABLE public.user_health ENABLE ROW LEVEL SECURITY;

-- 3. Owner-only SELECT: a user can only read their own row.
CREATE POLICY "user_health: owner select"
  ON public.user_health
  FOR SELECT
  USING (auth.uid() = user_id);

-- 4. Owner-only INSERT: a user can only insert their own row.
CREATE POLICY "user_health: owner insert"
  ON public.user_health
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- 5. Owner-only UPDATE: a user can only update their own row.
CREATE POLICY "user_health: owner update"
  ON public.user_health
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- No DELETE policy: ON DELETE CASCADE from auth.users handles cleanup.

-- 6. Migrate existing baseline data from profiles.
INSERT INTO public.user_health (user_id, baseline_mean, baseline_std, updated_at)
SELECT
  id,
  baseline_mean,
  baseline_std,
  COALESCE(baseline_updated_at, now())
FROM public.profiles
WHERE baseline_mean IS NOT NULL;

-- 7. Drop the now-migrated columns from profiles.
ALTER TABLE public.profiles DROP COLUMN IF EXISTS baseline_mean;
ALTER TABLE public.profiles DROP COLUMN IF EXISTS baseline_std;
ALTER TABLE public.profiles DROP COLUMN IF EXISTS baseline_updated_at;
