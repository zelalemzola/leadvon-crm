-- Per-organization Twilio sender settings (own number or messaging service).

ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS twilio_from_number text,
  ADD COLUMN IF NOT EXISTS twilio_messaging_service_sid text;

ALTER TABLE public.organizations
  DROP CONSTRAINT IF EXISTS organizations_twilio_sender_check;

ALTER TABLE public.organizations
  ADD CONSTRAINT organizations_twilio_sender_check CHECK (
    twilio_from_number IS NULL
    OR twilio_messaging_service_sid IS NULL
  );
