-- Step 1: DRY RUN - First see what would be deleted
-- Run this first to check what test records exist

SELECT 
  id,
  from_email, 
  to_email,
  subject, 
  plusvibe_id,
  created_at,
  LEFT(body_text, 100) as body_preview,
  'WOULD DELETE' as action
FROM email_threads 
WHERE 
  -- Test domains
  from_email LIKE '%@example.com'
  OR from_email LIKE '%test@%'
  OR to_email LIKE '%@example.com'
  
  -- Test subjects
  OR subject ILIKE '%test%'
  OR subject = 'Re: Test'
  
  -- Test IDs we used
  OR plusvibe_id LIKE 'debug-%'
  OR plusvibe_id LIKE 'test-%'
  OR plusvibe_id LIKE 'log-%'
  OR plusvibe_id LIKE 'reply-test%'
  OR plusvibe_id LIKE 'sent-%'
  OR plusvibe_id LIKE 'bounce-%'
  OR plusvibe_id LIKE 'email-test%'
  OR plusvibe_id LIKE 'final-%'
  OR plusvibe_id LIKE 'working-%'
  OR plusvibe_id LIKE 'sent-id%'
  OR plusvibe_id LIKE 'email-reply%'

ORDER BY created_at DESC;

-- Step 2: Uncomment below to actually delete after reviewing
/*
DELETE FROM email_threads 
WHERE 
  from_email LIKE '%@example.com'
  OR from_email LIKE '%test@%'
  OR to_email LIKE '%@example.com'
  OR subject ILIKE '%test%'
  OR subject = 'Re: Test'
  OR plusvibe_id LIKE 'debug-%'
  OR plusvibe_id LIKE 'test-%'
  OR plusvibe_id LIKE 'log-%'
  OR plusvibe_id LIKE 'reply-test%'
  OR plusvibe_id LIKE 'sent-%'
  OR plusvibe_id LIKE 'bounce-%'
  OR plusvibe_id LIKE 'email-test%'
  OR plusvibe_id LIKE 'final-%'
  OR plusvibe_id LIKE 'working-%'
  OR plusvibe_id LIKE 'sent-id%'
  OR plusvibe_id LIKE 'email-reply%';

SELECT 'Test records deleted' as result;
SELECT COUNT(*) as remaining_emails FROM email_threads;
*/
