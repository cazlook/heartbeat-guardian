ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS read_at timestamptz;

CREATE POLICY "Recipients can mark messages as read"
ON public.messages
FOR UPDATE
TO authenticated
USING (is_match_participant(match_id, auth.uid()) AND sender_id <> auth.uid())
WITH CHECK (is_match_participant(match_id, auth.uid()) AND sender_id <> auth.uid());

ALTER TABLE public.messages REPLICA IDENTITY FULL;