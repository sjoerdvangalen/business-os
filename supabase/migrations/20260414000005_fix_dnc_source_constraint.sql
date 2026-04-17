-- Fix dnc_entities.source CHECK constraint
-- webhook-meeting edge function uses source = 'webhook-meeting'

ALTER TABLE dnc_entities
  DROP CONSTRAINT IF EXISTS dnc_entities_source_check;

ALTER TABLE dnc_entities
  ADD CONSTRAINT dnc_entities_source_check
  CHECK (source IN ('emailbison_webhook', 'manual', 'system', 'webhook-meeting'));
