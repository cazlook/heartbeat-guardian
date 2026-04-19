-- ============ updated_at helper ============
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- ============ profiles ============
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT,
  age INTEGER CHECK (age IS NULL OR (age >= 18 AND age <= 120)),
  bio TEXT,
  gender TEXT,
  looking_for TEXT,
  photos TEXT[] NOT NULL DEFAULT '{}',
  baseline_mean NUMERIC,
  baseline_std NUMERIC,
  baseline_updated_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Discovery requires viewing other users' profiles
CREATE POLICY "Profiles are viewable by authenticated users"
  ON public.profiles FOR SELECT
  TO authenticated USING (true);

CREATE POLICY "Users can insert their own profile"
  ON public.profiles FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = id);

CREATE POLICY "Users can update their own profile"
  ON public.profiles FOR UPDATE
  TO authenticated USING (auth.uid() = id);

CREATE POLICY "Users can delete their own profile"
  ON public.profiles FOR DELETE
  TO authenticated USING (auth.uid() = id);

CREATE TRIGGER trg_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Auto-create profile row on signup, seeding from user_metadata
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, name, age, gender, looking_for)
  VALUES (
    NEW.id,
    NULLIF(NEW.raw_user_meta_data ->> 'name', ''),
    NULLIF(NEW.raw_user_meta_data ->> 'age', '')::INTEGER,
    NULLIF(NEW.raw_user_meta_data ->> 'gender', ''),
    NULLIF(NEW.raw_user_meta_data ->> 'looking_for', '')
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============ biometric_reactions ============
CREATE TYPE public.reaction_intensity AS ENUM ('low', 'medium', 'high');

CREATE TABLE public.biometric_reactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  viewer_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  profile_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  z_score NUMERIC NOT NULL,
  peak_bpm NUMERIC NOT NULL,
  baseline_mean NUMERIC NOT NULL,
  baseline_std NUMERIC NOT NULL,
  intensity public.reaction_intensity NOT NULL,
  confidence NUMERIC NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
  duration_ms INTEGER NOT NULL CHECK (duration_ms >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_reactions_viewer ON public.biometric_reactions (viewer_id, created_at DESC);
CREATE INDEX idx_reactions_profile ON public.biometric_reactions (profile_id, created_at DESC);

ALTER TABLE public.biometric_reactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own reactions"
  ON public.biometric_reactions FOR SELECT
  TO authenticated USING (auth.uid() = viewer_id);

CREATE POLICY "Users can insert their own reactions"
  ON public.biometric_reactions FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = viewer_id);

CREATE POLICY "Users can delete their own reactions"
  ON public.biometric_reactions FOR DELETE
  TO authenticated USING (auth.uid() = viewer_id);

-- ============ matches ============
CREATE TABLE public.matches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_a UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  user_b UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  cardiac_score NUMERIC NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT matches_distinct_users CHECK (user_a <> user_b),
  CONSTRAINT matches_ordered_users CHECK (user_a < user_b),
  CONSTRAINT matches_unique_pair UNIQUE (user_a, user_b)
);

CREATE INDEX idx_matches_user_a ON public.matches (user_a);
CREATE INDEX idx_matches_user_b ON public.matches (user_b);

ALTER TABLE public.matches ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own matches"
  ON public.matches FOR SELECT
  TO authenticated USING (auth.uid() = user_a OR auth.uid() = user_b);

-- Matches are typically created by trusted backend logic. Allow either party to create.
CREATE POLICY "Users can create matches they participate in"
  ON public.matches FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_a OR auth.uid() = user_b);

CREATE POLICY "Users can delete their own matches"
  ON public.matches FOR DELETE
  TO authenticated USING (auth.uid() = user_a OR auth.uid() = user_b);

-- ============ messages ============
CREATE TABLE public.messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id UUID NOT NULL REFERENCES public.matches(id) ON DELETE CASCADE,
  sender_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  content TEXT NOT NULL CHECK (length(content) > 0 AND length(content) <= 4000),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_messages_match_created ON public.messages (match_id, created_at);

ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

-- Helper: is the user a participant in this match?
CREATE OR REPLACE FUNCTION public.is_match_participant(_match_id UUID, _user_id UUID)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.matches
    WHERE id = _match_id AND (user_a = _user_id OR user_b = _user_id)
  );
$$;

CREATE POLICY "Participants can read messages"
  ON public.messages FOR SELECT
  TO authenticated USING (public.is_match_participant(match_id, auth.uid()));

CREATE POLICY "Participants can send messages"
  ON public.messages FOR INSERT
  TO authenticated WITH CHECK (
    auth.uid() = sender_id
    AND public.is_match_participant(match_id, auth.uid())
  );

CREATE POLICY "Senders can delete their messages"
  ON public.messages FOR DELETE
  TO authenticated USING (auth.uid() = sender_id);

-- ============ realtime ============
ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;
ALTER PUBLICATION supabase_realtime ADD TABLE public.matches;
ALTER TABLE public.messages REPLICA IDENTITY FULL;
ALTER TABLE public.matches REPLICA IDENTITY FULL;