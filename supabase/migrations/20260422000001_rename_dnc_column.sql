-- Rename dnc_entities.source_contact_campaign_id → source_lead_id
-- Reden: de kolom verwijst naar de 'leads' tabel (niet een contact_campaigns tabel die nooit bestond)
-- FK is al correct (→ leads.id), alleen de kolomnaam was misleidend

ALTER TABLE dnc_entities
  RENAME COLUMN source_contact_campaign_id TO source_lead_id;
