// One-shot seeder for two test users (Marco + Sara).
// Safe to call multiple times: re-uses existing auth users by email and upserts profile.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.58.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const TEST_USERS = [
  {
    email: "test.a@heartsync.dev",
    password: "TestA1234!",
    profile: {
      name: "Marco",
      age: 28,
      gender: "male",
      looking_for: "female",
      bio: "Appassionato di montagna e fotografia",
      photos: [
        "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=800&q=80&auto=format&fit=crop",
      ],
    },
  },
  {
    email: "test.b@heartsync.dev",
    password: "TestB1234!",
    profile: {
      name: "Sara",
      age: 26,
      gender: "female",
      looking_for: "male",
      bio: "Amo viaggiare e cucinare",
      photos: [
        "https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=800&q=80&auto=format&fit=crop",
      ],
    },
  },
];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const results: Array<Record<string, unknown>> = [];

  for (const u of TEST_USERS) {
    let userId: string | null = null;

    // 1. Try create
    const { data: created, error: createErr } = await supabase.auth.admin.createUser({
      email: u.email,
      password: u.password,
      email_confirm: true,
      user_metadata: {
        name: u.profile.name,
        age: String(u.profile.age),
        gender: u.profile.gender,
        looking_for: u.profile.looking_for,
      },
    });

    if (created?.user) {
      userId = created.user.id;
    } else {
      // 2. Already exists → list & find
      const { data: list } = await supabase.auth.admin.listUsers({ page: 1, perPage: 200 });
      const found = list?.users.find((x) => x.email === u.email);
      if (!found) {
        results.push({ email: u.email, error: createErr?.message ?? "not found" });
        continue;
      }
      userId = found.id;
    }

    // 3. Upsert profile (handle_new_user trigger fires on create, but bio/photos still need upsert)
    const { error: profileErr } = await supabase
      .from("profiles")
      .upsert(
        {
          id: userId,
          name: u.profile.name,
          age: u.profile.age,
          gender: u.profile.gender,
          looking_for: u.profile.looking_for,
          bio: u.profile.bio,
          photos: u.profile.photos,
        },
        { onConflict: "id" },
      );

    results.push({
      email: u.email,
      user_id: userId,
      profile_error: profileErr?.message ?? null,
    });
  }

  return new Response(JSON.stringify({ ok: true, results }, null, 2), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
