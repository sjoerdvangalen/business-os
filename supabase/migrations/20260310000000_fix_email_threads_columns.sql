-- Rename label → plusvibe_label for clarity
-- The label field stores PlusVibe's lead label (e.g. INTERESTED, NOT_INTERESTED)
ALTER TABLE email_threads RENAME COLUMN label TO plusvibe_label;
