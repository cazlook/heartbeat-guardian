DROP POLICY IF EXISTS "Recipient can update status" ON public.date_invites;

CREATE POLICY "Recipients can respond to invites"
ON public.date_invites
FOR UPDATE
TO authenticated
USING (auth.uid() = to_user_id)
WITH CHECK (auth.uid() = to_user_id);