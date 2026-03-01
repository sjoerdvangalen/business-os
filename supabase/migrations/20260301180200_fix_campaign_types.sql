-- Fix send_priority: PlusVibe sends decimal values like 0.5
ALTER TABLE campaigns ALTER COLUMN send_priority TYPE DECIMAL(3,2) USING send_priority::DECIMAL(3,2);

-- Fix start_date/end_date: PlusVibe sends date strings, not timestamps
-- These are already TIMESTAMPTZ which should accept date strings, but let's make them nullable
ALTER TABLE campaigns ALTER COLUMN start_date DROP NOT NULL;
ALTER TABLE campaigns ALTER COLUMN end_date DROP NOT NULL;
