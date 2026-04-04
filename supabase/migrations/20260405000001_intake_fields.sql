-- Intake tracking fields on clients
-- Supports Jotform webhook ingestion via webhook-jotform-intake edge function
-- Latest-state model: onboarding_form / onboarding_form_raw are overwritten on each submission

ALTER TABLE clients
  ADD COLUMN IF NOT EXISTS intake_status TEXT NOT NULL DEFAULT 'none'
    CONSTRAINT clients_intake_status_check
    CHECK (intake_status IN ('none', 'form_submitted', 'review_required', 'research_started', 'synthesis_ready')),
  ADD COLUMN IF NOT EXISTS last_intake_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS primary_contact_email TEXT,
  ADD COLUMN IF NOT EXISTS onboarding_form_raw JSONB;

COMMENT ON COLUMN clients.intake_status IS 'none | form_submitted | review_required | research_started | synthesis_ready';
COMMENT ON COLUMN clients.onboarding_form IS 'Normalized intake contract v1 (canonical shape, latest submission)';
COMMENT ON COLUMN clients.onboarding_form_raw IS 'Exact Jotform webhook payload — voor debugging en replay (latest submission)';
