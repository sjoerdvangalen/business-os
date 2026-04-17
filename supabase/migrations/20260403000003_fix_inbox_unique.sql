-- Fix: Maak provider_inbox_id UNIQUE voor upsert
ALTER TABLE email_inboxes 
  ADD CONSTRAINT unique_provider_inbox UNIQUE (provider, provider_inbox_id);
