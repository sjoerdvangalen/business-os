-- Add recording_url column for storing meeting recording file links
ALTER TABLE meetings ADD COLUMN IF NOT EXISTS recording_url text;
