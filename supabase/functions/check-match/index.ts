// Bilateral match checker.
//
// Called from the client after every successful biometric_reactions insert.
// Creates a `matches` row when both users have ≥ 2 reactions toward each
// other with z_score ≥ Z_THRESHOLD and no prior match exists.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.58.0';
import { corsHeaders } from 'https://esm.sh/@supabase/supabase-js@2.58.0/cors';

const Z_THRESHOLD = 1.5;
const MIN_REACTIONS = 2;

interface Body {
  viewer_id?: string;
  profile_id?: string;
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });

// Normalize a raw cardiac score (sum of two avg z-scores / 2) onto 0–100.
// We treat z = Z_THRESHOLD as score 50 and z = 4.0 as score 100.
const toCardiacScore = (avgZ: number): number => {
  const min = Z_THRESHOLD;
  const max = 4.0;
  const clamped = Math.max(min, Math.min(max, avgZ));
  const score = 50 + ((clamped - min) / (max - min)) * 50;
  return Math.round(score * 10) / 10;
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return json({ error: 'Unauthorized' }, 401);
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const token = authHeader.replace('Bearer ', '');
    const { data: claimsData, error: claimsErr } = await userClient.auth.getClaims(token);
    if (claimsErr || !claimsData?.claims) {
      return json({ error: 'Unauthorized' }, 401);
    }
    const callerId = claimsData.claims.sub as string;

    let body: Body;
    try {
      body = await req.json();
    } catch {
      return json({ error: 'Invalid JSON body' }, 400);
    }

    const { viewer_id, profile_id } = body;
    if (!viewer_id || !profile_id) {
      return json({ error: 'viewer_id and profile_id are required' }, 400);
    }
    if (viewer_id === profile_id) {
      return json({ error: 'viewer_id and profile_id must differ' }, 400);
    }
    if (callerId !== viewer_id) {
      return json({ error: 'viewer_id must match the authenticated user' }, 403);
    }

    // Use service role to read both sides of biometric_reactions
    // (RLS only lets each user read their own reactions).
    const admin = createClient(supabaseUrl, serviceKey);

    const [aToBRes, bToARes] = await Promise.all([
      admin
        .from('biometric_reactions')
        .select('z_score')
        .eq('viewer_id', viewer_id)
        .eq('profile_id', profile_id)
        .gte('z_score', Z_THRESHOLD),
      admin
        .from('biometric_reactions')
        .select('z_score')
        .eq('viewer_id', profile_id)
        .eq('profile_id', viewer_id)
        .gte('z_score', Z_THRESHOLD),
    ]);

    if (aToBRes.error) return json({ error: aToBRes.error.message }, 500);
    if (bToARes.error) return json({ error: bToARes.error.message }, 500);

    const aToB = aToBRes.data ?? [];
    const bToA = bToARes.data ?? [];

    if (aToB.length < MIN_REACTIONS || bToA.length < MIN_REACTIONS) {
      return json({ matched: false });
    }

    // Check existing match (either ordering of user_a/user_b)
    const { data: existing, error: existingErr } = await admin
      .from('matches')
      .select('id, cardiac_score')
      .or(
        `and(user_a.eq.${viewer_id},user_b.eq.${profile_id}),and(user_a.eq.${profile_id},user_b.eq.${viewer_id})`,
      )
      .maybeSingle();
    if (existingErr) return json({ error: existingErr.message }, 500);
    if (existing) {
      return json({
        matched: true,
        match_id: existing.id,
        cardiac_score: existing.cardiac_score,
        already_existed: true,
      });
    }

    const avg = (xs: { z_score: number }[]) =>
      xs.reduce((s, r) => s + Number(r.z_score), 0) / xs.length;

    const avgAtoB = avg(aToB);
    const avgBtoA = avg(bToA);
    const combinedZ = (avgAtoB + avgBtoA) / 2;
    const cardiacScore = toCardiacScore(combinedZ);

    // Stable ordering avoids accidental duplicates if two parallel calls race.
    const [user_a, user_b] =
      viewer_id < profile_id ? [viewer_id, profile_id] : [profile_id, viewer_id];

    const { data: inserted, error: insertErr } = await admin
      .from('matches')
      .insert({ user_a, user_b, cardiac_score: cardiacScore })
      .select('id, cardiac_score')
      .single();
    if (insertErr) return json({ error: insertErr.message }, 500);

    return json({
      matched: true,
      match_id: inserted.id,
      cardiac_score: inserted.cardiac_score,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Unknown error';
    return json({ error: msg }, 500);
  }
});
