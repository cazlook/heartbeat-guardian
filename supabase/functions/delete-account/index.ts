// Account deletion (GDPR / store compliance).
//
// Deletes every row owned by the authenticated user, their storage objects,
// and finally the auth user itself. Idempotent: re-running on a half-deleted
// account just removes what is left.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.58.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });

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
    const userId = claimsData.claims.sub as string;

    const admin = createClient(supabaseUrl, serviceKey);

    // 1. Matches involving the user (messages/invites cascade via FK,
    //    but delete them explicitly in case cascade is not set).
    const { data: matches } = await admin
      .from('matches')
      .select('id')
      .or(`user_a.eq.${userId},user_b.eq.${userId}`);
    const matchIds = (matches ?? []).map((m) => m.id);
    if (matchIds.length > 0) {
      await admin.from('messages').delete().in('match_id', matchIds);
      await admin.from('date_invites').delete().in('match_id', matchIds);
      await admin.from('matches').delete().in('id', matchIds);
    }

    // 2. Biometric reactions (both directions: written by and about the user).
    await admin.from('biometric_reactions').delete().eq('viewer_id', userId);
    await admin.from('biometric_reactions').delete().eq('profile_id', userId);

    // 3. Storage: profile photos.
    const { data: objects } = await admin.storage.from('avatars').list(userId);
    if (objects && objects.length > 0) {
      await admin.storage
        .from('avatars')
        .remove(objects.map((o) => `${userId}/${o.name}`));
    }

    // 4. Profile row.
    await admin.from('profiles').delete().eq('id', userId);

    // 5. Auth user.
    const { error: delErr } = await admin.auth.admin.deleteUser(userId);
    if (delErr) return json({ error: delErr.message }, 500);

    return json({ deleted: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Unknown error';
    return json({ error: msg }, 500);
  }
});
