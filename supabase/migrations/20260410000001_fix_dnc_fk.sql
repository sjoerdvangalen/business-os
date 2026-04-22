-- Fix broken FK in dnc_entities
-- source_lead_id had een kapotte FK; FK hersteld → leads tabel
-- Kolom tijdelijk hernoemd naar source_contact_campaign_id (zie 20260422000001 voor terughernoemen)

ALTER TABLE dnc_entities DROP CONSTRAINT IF EXISTS dnc_entities_source_lead_id_fkey;

ALTER TABLE dnc_entities RENAME COLUMN source_lead_id TO source_contact_campaign_id;

ALTER TABLE dnc_entities ADD CONSTRAINT dnc_entities_source_contact_campaign_id_fkey
  FOREIGN KEY (source_contact_campaign_id) REFERENCES leads(id) ON DELETE SET NULL;
