-- Fix duplicate columns in email_threads
-- Remove wrong column names, keep correct ones

-- First, check what columns actually exist
DO $$
DECLARE
  col_exists BOOLEAN;
BEGIN
  -- Check if wrong columns exist and migrate data if needed
  
  -- If sender_email exists but from_email doesn't, rename it
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'email_threads' AND column_name = 'sender_email'
  ) INTO col_exists;
  
  IF col_exists THEN
    -- Check if from_email also exists
    SELECT EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_name = 'email_threads' AND column_name = 'from_email'
    ) INTO col_exists;
    
    IF NOT col_exists THEN
      -- Rename sender_email to from_email
      ALTER TABLE email_threads RENAME COLUMN sender_email TO from_email;
    ELSE
      -- Both exist, drop the wrong one
      ALTER TABLE email_threads DROP COLUMN IF EXISTS sender_email;
    END IF;
  END IF;
  
  -- Same for recipient_email -> to_email
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'email_threads' AND column_name = 'recipient_email'
  ) INTO col_exists;
  
  IF col_exists THEN
    SELECT EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_name = 'email_threads' AND column_name = 'to_email'
    ) INTO col_exists;
    
    IF NOT col_exists THEN
      ALTER TABLE email_threads RENAME COLUMN recipient_email TO to_email;
    ELSE
      ALTER TABLE email_threads DROP COLUMN IF EXISTS recipient_email;
    END IF;
  END IF;
  
  -- Same for body -> body_text  
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'email_threads' AND column_name = 'body'
  ) INTO col_exists;
  
  IF col_exists THEN
    SELECT EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_name = 'email_threads' AND column_name = 'body_text'
    ) INTO col_exists;
    
    IF NOT col_exists THEN
      ALTER TABLE email_threads RENAME COLUMN body TO body_text;
    ELSE
      ALTER TABLE email_threads DROP COLUMN IF EXISTS body;
    END IF;
  END IF;
END $$;

-- Ensure correct columns exist
ALTER TABLE email_threads ADD COLUMN IF NOT EXISTS from_email TEXT;
ALTER TABLE email_threads ADD COLUMN IF NOT EXISTS to_email TEXT;
ALTER TABLE email_threads ADD COLUMN IF NOT EXISTS body_text TEXT;
ALTER TABLE email_threads ADD COLUMN IF NOT EXISTS body_html TEXT;

-- List remaining columns for verification
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'email_threads' 
ORDER BY ordinal_position;
