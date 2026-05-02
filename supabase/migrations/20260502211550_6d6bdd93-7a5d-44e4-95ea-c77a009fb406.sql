
DO $$
DECLARE
  v_data jsonb := '[
    {"name":"Sofia","age":28,"score":72,"bio":"Amante dei tramonti e del buon vino.","interests":["arte","vino","viaggi"]},
    {"name":"Giulia","age":26,"score":76,"bio":"Vivo di libri, caffè e lunghe camminate.","interests":["libri","caffe","trekking"]},
    {"name":"Martina","age":31,"score":79,"bio":"Cerco connessioni autentiche, non swipe veloci.","interests":["musica","cinema","cucina"]},
    {"name":"Chiara","age":24,"score":82,"bio":"Yoga, montagna, e una buona conversazione.","interests":["yoga","montagna","natura"]},
    {"name":"Francesca","age":33,"score":85,"bio":"Architetto di giorno, sognatrice di notte.","interests":["design","architettura","fotografia"]},
    {"name":"Elena","age":29,"score":87,"bio":"Il mio cuore batte forte per la musica live.","interests":["concerti","vinile","indie"]},
    {"name":"Sara","age":27,"score":89,"bio":"Curiosa del mondo e delle persone vere.","interests":["viaggi","lingue","filosofia"]},
    {"name":"Valentina","age":30,"score":91,"bio":"Cinema d''autore e cucina improvvisata.","interests":["cinema","cucina","teatro"]},
    {"name":"Alice","age":25,"score":93,"bio":"Corro al mattino, ballo la sera.","interests":["running","danza","fitness"]},
    {"name":"Federica","age":35,"score":95,"bio":"Onesta, ironica, un po'' caotica.","interests":["stand-up","serie tv","aperitivi"]}
  ]'::jsonb;
  v_marco uuid := '0e2c61e4-cfdf-4697-bc9f-b92232476ed4';
  v_item jsonb;
  v_uid uuid;
  v_email text;
  v_name text;
  v_age int;
  v_score int;
  v_photo text := 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=600';
  v_interests text[];
  v_idx int := 0;
BEGIN
  FOR v_item IN SELECT * FROM jsonb_array_elements(v_data)
  LOOP
    v_idx := v_idx + 1;
    v_name := v_item->>'name';
    v_age := (v_item->>'age')::int;
    v_score := (v_item->>'score')::int;
    v_email := lower(v_name) || '.test@heartsync.dev';
    v_uid := gen_random_uuid();
    SELECT array_agg(value::text) INTO v_interests
      FROM jsonb_array_elements_text(v_item->'interests');

    INSERT INTO auth.users (
      instance_id, id, aud, role, email, encrypted_password,
      email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
      created_at, updated_at, confirmation_token, email_change, email_change_token_new, recovery_token
    ) VALUES (
      '00000000-0000-0000-0000-000000000000', v_uid, 'authenticated', 'authenticated',
      v_email, crypt('Test1234!', gen_salt('bf')),
      now(),
      '{"provider":"email","providers":["email"]}'::jsonb,
      jsonb_build_object('name', v_name, 'age', v_age::text, 'gender', 'female', 'looking_for', 'male'),
      now(), now(), '', '', '', ''
    );

    INSERT INTO auth.identities (
      provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at
    ) VALUES (
      v_uid::text, v_uid,
      jsonb_build_object('sub', v_uid::text, 'email', v_email, 'email_verified', true),
      'email', now(), now(), now()
    );

    INSERT INTO public.profiles (id, name, age, gender, looking_for, bio, photos, interests, distance_km)
    VALUES (
      v_uid, v_name, v_age, 'female', 'male',
      v_item->>'bio', ARRAY[v_photo], v_interests, (5 + v_idx * 2)::real
    )
    ON CONFLICT (id) DO UPDATE SET
      name = EXCLUDED.name, age = EXCLUDED.age, gender = EXCLUDED.gender,
      looking_for = EXCLUDED.looking_for, bio = EXCLUDED.bio,
      photos = EXCLUDED.photos, interests = EXCLUDED.interests,
      distance_km = EXCLUDED.distance_km;

    INSERT INTO public.matches (user_a, user_b, cardiac_score)
    VALUES (LEAST(v_marco, v_uid), GREATEST(v_marco, v_uid), v_score);
  END LOOP;
END $$;
