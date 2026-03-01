-- Drop NOT NULL on contract date columns
ALTER TABLE contracts ALTER COLUMN start_date DROP NOT NULL;
ALTER TABLE contracts ALTER COLUMN end_date DROP NOT NULL;
ALTER TABLE contracts ALTER COLUMN sent_date DROP NOT NULL;
ALTER TABLE contracts ALTER COLUMN signed_date DROP NOT NULL;
