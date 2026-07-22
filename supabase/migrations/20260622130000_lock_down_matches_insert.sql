-- R5: Remove client-side INSERT capability on matches.
--
-- Previously a policy "Users can create matches they participate in" allowed
-- any authenticated client to INSERT a match row if they were user_a or user_b.
-- This is unsafe: a malicious client could forge matches.
--
-- The check-match edge function runs with the service role key and therefore
-- bypasses RLS entirely. It is the ONLY writer of match rows. With no INSERT
-- policy and RLS enabled, direct client inserts are rejected by Postgres.
--
-- NOTE: UNIQUE(user_a, user_b) and CHECK(user_a < user_b) already exist on
-- this table (added in an earlier migration) — they are NOT re-added here.

DROP POLICY IF EXISTS "Users can create matches they participate in" ON public.matches;

-- No replacement INSERT policy is added intentionally.
-- RLS is already enabled on public.matches; absence of an INSERT policy means
-- client JWTs cannot insert rows regardless of their content.
