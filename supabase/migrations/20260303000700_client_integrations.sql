-- ============================================================
-- Multi-Provider Calendar Integration System
-- ============================================================
-- Supports: Cal.com, Calendly, GoHighLevel, Google Calendar, etc.
-- Each client can have multiple integrations
-- Each integration has a unique webhook token for routing

-- Enable pgcrypto for secure token generation
create extension if not exists pgcrypto;

-- 1. Client Integrations table
create table if not exists client_integrations (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients(id) on delete cascade,

  -- Integration identification
  integration_type text not null, -- 'calcom', 'calendly', 'gohighlevel', 'google_calendar'
  name text not null, -- "Cal.com GTMS", "Calendly Sales", etc.

  -- Webhook routing (use replace to remove hyphens from uuid for cleaner tokens)
  webhook_token text unique not null default replace(gen_random_uuid()::text, '-', ''),
  webhook_secret text, -- for signature verification (optional)

  -- Provider-specific config
  provider_config jsonb default '{}', -- API keys, organizer IDs, etc.
  -- Example calcom: { "organizer_id": 1656697, "event_types": ["discovery", "demo"] }
  -- Example calendly: { "user_uri": "https://api.calendly.com/users/xxx" }
  -- Example gohighlevel: { "location_id": "xxx", "calendar_id": "xxx" }

  -- Status
  is_active boolean default true,
  last_webhook_at timestamptz,
  webhook_count int default 0,

  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Indexes
create index idx_client_integrations_client on client_integrations(client_id);
create index idx_client_integrations_token on client_integrations(webhook_token);
create index idx_client_integrations_type on client_integrations(integration_type);

-- 2. Add integration_id to meetings table
alter table meetings
  add column if not exists integration_id uuid references client_integrations(id),
  add column if not exists integration_type text, -- redundant for fast filtering
  add column if not exists provider_booking_id text, -- generic booking ID from any provider
  add column if not exists provider_event_type text, -- generic event type
  add column if not exists source text default 'manual'; -- 'calcom', 'calendly', 'gohighlevel', 'manual'

-- Index for provider booking dedup
create index if not exists idx_meetings_provider_booking on meetings(provider_booking_id) where provider_booking_id is not null;
create index if not exists idx_meetings_integration on meetings(integration_id);

-- 3. Updated_at trigger for client_integrations
create or replace function update_client_integrations_timestamp()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger trg_client_integrations_updated
  before update on client_integrations
  for each row execute function update_client_integrations_timestamp();

-- 4. Insert existing Cal.com integrations based on clients that use Cal.com
-- This seeds the table with known clients
-- (You can add more via Supabase dashboard or API)
insert into client_integrations (client_id, integration_type, name, provider_config)
select
  id,
  'calcom',
  'Cal.com ' || client_code,
  jsonb_build_object('calendar_type', 'calcom')
from clients
where calendar_type = 'cal.com' or calendar_type = 'calcom'
on conflict do nothing;
