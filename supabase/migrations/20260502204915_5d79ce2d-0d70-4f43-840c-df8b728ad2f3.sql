ALTER TABLE public.date_invites
  ADD COLUMN IF NOT EXISTS invite_type text CHECK (invite_type IN ('caffe','aperitivo','cena','passeggiata','altro')),
  ADD COLUMN IF NOT EXISTS location text,
  ADD COLUMN IF NOT EXISTS scheduled_at timestamptz,
  ADD COLUMN IF NOT EXISTS note text,
  ADD COLUMN IF NOT EXISTS event_id uuid NULL;

ALTER TABLE public.date_invites
  ALTER COLUMN type DROP NOT NULL,
  ALTER COLUMN day DROP NOT NULL,
  ALTER COLUMN slot DROP NOT NULL;