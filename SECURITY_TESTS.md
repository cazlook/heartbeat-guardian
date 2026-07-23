# Manual Security Test Checklist — Fase 1 (R5/R8/R4/R1)

Run these against the Supabase project after applying migrations and deploying edge functions.

## R5 — matches server-authoritative

- [ ] **Forged client INSERT blocked**: Using the anon key + a valid user JWT, attempt to INSERT directly into `public.matches` (e.g. via `supabase.from('matches').insert({...})`). Expected: Postgres returns a 403/RLS error; no row is created.
- [ ] **Reciprocal reactions trigger match**: Simulate two users each having ≥ 2 cardiac reactions (z ≥ 1.5) toward each other in `biometric_reactions`. Call the `check-match` edge function as one of them. Expected: `{ matched: true, match_id: "...", cardiac_score: ... }` and a row appears in `matches`.
- [ ] **Duplicate call returns existing match**: Call `check-match` a second time for the same pair. Expected: `{ matched: true, already_existed: true, match_id: "..." }` (same id as before, no duplicate row).
- [ ] **Single-sided reactions → no match**: Only user A has ≥ 2 reactions toward B; B has none toward A. Call `check-match` as A. Expected: `{ matched: false }`.

## R8 — prod debug surface stripped

- [ ] **?debug=1 shows no panel**: Open the production build URL with `?debug=1` appended. Expected: no debug BPM slider, no debug log panel; the query param has no effect.
- [ ] **/debug → NotFound**: Navigate to `/debug` in the production build. Expected: the 404 / NotFound page is rendered; the Debug validation screen does not appear.

## R4 — user_health owner-only

- [ ] **Own row readable**: Authenticated as user A, query `supabase.from('user_health').select('*').eq('user_id', A_ID)`. Expected: returns user A's row (or empty if none).
- [ ] **Cross-user read blocked**: Authenticated as user A, query `supabase.from('user_health').select('*').eq('user_id', B_ID)`. Expected: 0 rows returned (RLS filters it out).
- [ ] **Cross-user update blocked**: Authenticated as user A, attempt `supabase.from('user_health').update({ baseline_mean: 999 }).eq('user_id', B_ID)`. Expected: 0 rows updated; no error (RLS silently filters).
- [ ] **profiles no longer exposes baseline**: Fetch any profile row. Expected: `baseline_mean`, `baseline_std`, `baseline_updated_at` columns are absent.

## R5 + Chat RLS (pre-existing, confirm still working)

- [ ] **Chat read without membership fails**: Authenticated as user C (not in a match), attempt to read messages for a match between A and B. Expected: 0 rows (RLS blocks access).
- [ ] **Chat write without membership fails**: Authenticated as user C, attempt to INSERT a message into a match they do not belong to. Expected: RLS error / 0 rows inserted.
