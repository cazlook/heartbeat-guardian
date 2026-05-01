CREATE TABLE public.date_invites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id uuid NOT NULL REFERENCES public.matches(id) ON DELETE CASCADE,
  from_user_id uuid NOT NULL,
  to_user_id uuid NOT NULL,
  type text NOT NULL,
  day text NOT NULL,
  slot text NOT NULL,
  area text,
  status text NOT NULL DEFAULT 'pending',
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.date_invites ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Participants can view invites"
ON public.date_invites
FOR SELECT
TO authenticated
USING (auth.uid() = from_user_id OR auth.uid() = to_user_id);

CREATE POLICY "Sender can create invites"
ON public.date_invites
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = from_user_id AND public.is_match_participant(match_id, auth.uid()));

CREATE POLICY "Recipient can update status"
ON public.date_invites
FOR UPDATE
TO authenticated
USING (auth.uid() = to_user_id);

CREATE POLICY "Sender can delete invites"
ON public.date_invites
FOR DELETE
TO authenticated
USING (auth.uid() = from_user_id);

CREATE TRIGGER update_date_invites_updated_at
BEFORE UPDATE ON public.date_invites
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_date_invites_match ON public.date_invites(match_id);
CREATE INDEX idx_date_invites_to_user ON public.date_invites(to_user_id);