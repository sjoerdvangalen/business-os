# Business OS — CLAUDE.md

## Owner
Sjoerd van Galen — founder of **VGG Acquisition** (B2B lead generation agency).
Also co-runs **GTM Scaling** with partner Niels (same model, shared clients).
No fixed employees — works with VA's and freelancers as needed.

## What VGG Acquisition does
Cold email outreach campaigns for B2B clients. We manage the full infrastructure:
domains, email accounts, warmup, campaign setup, lead sourcing, and optimization.
Revenue model: retainer + meeting fees + commission on closed deals.
**Core product = sales meetings. Meetings are what we deliver.**

## Communication
- **Nederlands** for conversation and explanations
- **Engels** for code, comments, commit messages, variable names, database columns
- Direct, geen omhaal. Geen emojis tenzij gevraagd.

## Tech Stack
- **Database**: Supabase (project: `gjhbbyodrbuabfzafzry`, region: West EU Ireland)
- **Edge Functions**: Deno + TypeScript (Supabase Edge Functions)
- **Email Platform**: PlusVibe (workspace: `68f8e5d7e13f67d591c4f0a8`)
- **Calendar**: Cal.com + GoHighLevel (multi-provider via webhook-meeting)
- **Automation**: Supabase pg_cron + Edge Functions (replacing n8n)
- **Communication**: Slack (per-client channels + #vgg-alerts), Google Workspace
- **Airtable**: Legacy/archive only — GTM Scaling base `appaGhM19wYDA9PqB`
- **n8n**: Still running as backup — DO NOT modify/deactivate n8n workflows until Supabase system is 100% stable
- **Code**: GitHub
- **Runtime**: Deno at `/Users/sjoerdvangalen/.deno/bin/deno`

## Project Structure
```
~/business-os/
├── CLAUDE.md                          # This file
├── .claude/commands/                  # Custom slash commands
│   ├── onboard.md                     # /onboard CLIENT_CODE — full pipeline
│   ├── research.md                    # /research CLIENT_CODE — deep company research
│   ├── strategy.md                    # /strategy CLIENT_CODE — ICP + offers
│   ├── copy.md                        # /copy CLIENT_CODE — email copy generation
│   └── review.md                      # /review CLIENT_CODE — pipeline status + approval
├── knowledge/                         # Outbound knowledge base
│   └── outbound-playbook.md           # Core playbook — ALL outbound decisions start here
├── research/                          # Client research .md files (1 per client)
│   └── FRTC.md, BETS.md, etc.
├── supabase/
│   ├── migrations/                    # SQL migrations (pushed with `npx supabase db push`)
│   └── functions/                     # Edge functions (deployed with `npx supabase functions deploy`)
│       ├── sync-plusvibe-campaigns/    # Every 15 min via pg_cron
│       ├── sync-plusvibe-accounts/     # Every 15 min via pg_cron
│       ├── sync-plusvibe-warmup/       # Daily at 00:00 UTC via pg_cron
│       ├── sync-plusvibe-leads/        # Every 15 min — lead catch-up sync
│       ├── sync-domains/              # Daily — domain health from email accounts
│       ├── sync-sequences/            # Every 15 min — email sequences from PlusVibe
│       ├── webhook-receiver/          # Real-time PlusVibe webhook events
│       ├── reply-classifier/          # Classifies replies (called by webhook-receiver)
│       ├── lead-router/               # Routes classified leads (called by reply-classifier)
│       ├── webhook-meeting/           # Multi-provider meeting webhook (Cal.com, Calendly, GHL)
│       ├── meeting-review/            # Cron */5 min — sends Slack Block Kit review after meetings
│       ├── webhook-slack-interaction/ # Slack button/modal handler for meeting reviews
│       ├── campaign-monitor/          # Health checks every 15 min
│       └── domain-monitor/            # Deliverability check daily at 06:00 UTC
└── sync/
    └── import-airtable.ts             # One-time import script (already run)
```

## Supabase Schema

### Core Tables
- `clients` — Hub table, all data connects here via client_id
  - `onboarding_form` JSONB, `research` JSONB, `strategy` JSONB
  - `onboarding_status` — pipeline stage tracking
  - `report_frequency` — weekly/biweekly/monthly
  - `slack_channel_id` — Slack channel for this client's alerts/reviews
- `campaigns` — Synced from PlusVibe
  - `health_status` — HEALTHY/WARNING/CRITICAL/UNKNOWN (set by campaign-monitor)
  - `monitoring_notes` JSONB — recent health check results
- `email_accounts` — Synced from PlusVibe (4,386 accounts)
- `domains` — Email sending domains (synced via sync-domains)
  - `spf_status`, `dkim_status`, `dmarc_status` — set by domain-monitor
- `contacts` — Leads (synced from PlusVibe + real-time via webhooks)
  - `reply_classification` — NOT_INTERESTED/BLOCKLIST/FUTURE_REQUEST/MEETING_REQUEST/INFO_REQUEST/OOO/POSITIVE/NEUTRAL
  - `lead_status` — new/contacted/replied/interested/meeting_booked/not_interested/blocklisted
- `sequences` — Email steps within campaigns (synced from PlusVibe)
- `email_messages` — Conversation history (real-time via webhooks)

### Meeting & CRM Tables
- `client_integrations` — Per-client calendar/webhook integrations
  - `integration_type` — calcom/calendly/gohighlevel
  - `webhook_token` — unique URL token per integration
  - `provider_config` JSONB — provider-specific settings
- `meetings` — Calendar meetings (real-time via webhook-meeting)
  - `booking_status` — booked/rescheduled/cancelled/completed/no_show/qualified/unqualified
  - `opportunity_id` — links to opportunity
  - `integration_id` — which client_integration created this
  - `provider_booking_id` — dedup key from calendar provider
  - `review_scheduled_at` — when to send Slack review (start_time + 30 min)
  - `review_slack_ts` — Slack message ID for updating review message
  - `reviewed_at`, `reviewed_by`, `review_status`, `review_notes`
  - `recording_url` — meeting recording link (from Unqualified modal)
- `opportunities` — CRM pipeline, auto-created on meeting booking
  - `status` mirrors `meetings.booking_status` (1:1)
  - `meeting_id` — links to meeting (bidirectional)
  - `campaign_id`, `contact_id`, `client_id`

### Operational Tables
- `sync_log` — Tracks every sync + agent operation
- `agent_memory` — AI agent context, alerts, classification logs, routing logs

### Meeting Lifecycle
```
Webhook (Cal.com/Calendly/GHL)
  → webhook-meeting (token-based routing per client)
    → BOOKED: create meeting + opportunity + PlusVibe update + Slack
    → CANCELLED: update meeting + opportunity status, clear review timer
    → RESCHEDULED: update times + opportunity status, reset review timer
  → 30 min after meeting: meeting-review cron sends Block Kit review to client Slack channel
    → Client clicks: Qualified / Unqualified / No-Show / Rescheduled
    → No-Show requires proof, VGG has final say
    → Opportunity status mirrors meeting status 1:1
```

### Agent Architecture
- **Reply pipeline**: PlusVibe webhooks → `webhook-receiver` → `reply-classifier` → `lead-router` → PlusVibe API + Slack
- **Meeting pipeline**: Cal.com/Calendly/GHL webhook → `webhook-meeting` → meetings + opportunities + PlusVibe API + Slack
- **Monitoring**: `campaign-monitor` (*/15 min), `domain-monitor` (daily)
- **Syncs**: campaigns, accounts, leads (*/15 min), warmup + domains (daily), sequences (*/15 min)

## Clients (active)
| Code | Name | What they do | Calendar |
|------|------|-------------|----------|
| FRTC | FRT Capital | Venture capital / investment fund | — |
| BETS | Better Socials | Social media marketing | Cal.com |
| AXIS | AXIND Software BV | Software development | — |
| SECX | SentioCX | AI-powered customer experience platform | — |
| REMR | Remote Rumble | Sales acquisition agency | — |
| PESC | Pescheck | International background checks platform | — |
| DOMS | Dovideq Medical Systems | Medical devices for minimally invasive surgery | Cal.com |
| DIGT | Digital Traffic | Digital marketing agency | GHL |
| PROL | Prolink | B2B services | GHL |
| OGNO | Ogno | Tech company | — |
| NEBE | NBE B.V. | B2B services | GHL |
| GTMS | GTM Scaling | Own company (with Niels) | Cal.com |
| QULF | Quality Lead Formula | Lead generation | — |
| LDEM | LDesignMedia | Design/media | — |

### Paused/Archived
| Code | Name | Status |
|------|------|--------|
| INPE | Inplenion ERP | Paused — Oracle NetSuite consulting |
| NELA | Next Level Amazon | Paused — Amazon seller consulting |
| SOVA | SOV Agency | Archived — Performance marketing |
| SOCT | Social Trends | Archived |
| POUL | PoultryPlan | Archived |

## Conventions
- **Campaign naming**: `CLIENT_CODE | Language | Description` (e.g., `FRTC | EN | Origination SaaS`)
- **Client matching**: Extract client_code from first segment of campaign name, uppercase
- **IDs**: All tables use UUID primary keys, PlusVibe records have `plusvibe_id` TEXT field
- **Timestamps**: All tables have `created_at` and `updated_at` (auto-updated via trigger)
- **Sync pattern**: Edge function → PlusVibe API → upsert into Supabase → log to sync_log
- **Meeting webhook URL**: `https://gjhbbyodrbuabfzafzry.supabase.co/functions/v1/webhook-meeting?token=<TOKEN>`

## Git & Commits
- Claude maakt automatisch commits na voltooide taken
- Commit messages in het Engels, kort en beschrijvend
- Format: `type: description` (e.g., `fix: convert campaigns.status from enum to text`)
- Altijd `Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>` toevoegen

## Important Commands
```bash
# Deploy edge functions
cd ~/business-os && npx supabase functions deploy webhook-meeting --no-verify-jwt
cd ~/business-os && npx supabase functions deploy sync-plusvibe-campaigns --no-verify-jwt

# Push migrations
cd ~/business-os && npx supabase db push

# Test meeting webhook
curl -s -X POST 'https://gjhbbyodrbuabfzafzry.supabase.co/functions/v1/webhook-meeting?token=<TOKEN>' \
  -H 'Content-Type: application/json' \
  -d '{"triggerEvent":"BOOKING_CREATED","payload":{...}}'
```

## Outbound Knowledge Base
**CRITICAL: For ALL outbound, cold email, targeting, copy, and GTM strategy decisions, ALWAYS read `knowledge/outbound-playbook.md` first.**

This playbook consolidates intelligence from GEX (Eric), Nick Abraham (Leadbird), Fivos Aresti, and the Cold Email v2 system.

**Rule: Never generate outbound advice, copy, or strategy from generic knowledge. Always ground it in the playbook.**

## Client Research
Research files for each client are stored in `research/CLIENT_CODE.md`.
**When asked about a client, ALWAYS read `research/CLIENT_CODE.md` first for full context.**

### Onboarding Pipeline
Client onboarding status is tracked in `clients.onboarding_status`:
`not_started` → `form_submitted` → `researched` → `strategy_done` → `copy_done` → `internal_review` → `client_review` → `approved` → `deployed`

### Custom Commands
- `/onboard CLIENT_CODE` — Full pipeline: form → research → strategy → copy
- `/research CLIENT_CODE` — Deep company research (web search + onboarding form)
- `/strategy CLIENT_CODE` — Generate ICPs + offer variants from research
- `/copy CLIENT_CODE` — Generate cold email copy from approved offers
- `/review CLIENT_CODE` — Show pipeline status and approve items

## Known Issues & Decisions
- Service role key is hardcoded in pg_cron migration — needs vault/secrets solution
- No RLS policies yet — everything is open (fine for now, needs fixing before dashboard)
- `aggregate-kpis` edge function is broken (writes to dropped `daily_kpis` table) — needs fix or removal
- `webhook-calendar` is deprecated — replaced by `webhook-meeting`
- n8n workflows still running as backup — DO NOT deactivate until Supabase system is fully verified
- Cal.com/GHL webhook URLs need to be configured in the calendar platforms (tokens ready, URLs not set)
- Slack review flow DONE — meeting-review cron + webhook-slack-interaction (Qualified direct, Unqualified/No-Show/Rescheduled via modals)
- `SLACK_TEST_CHANNEL` env var still set to `C0A50BSF8E8` (GTM Scaling) — unset when going live per client
- PlusVibe API key hardcoded in webhook-meeting — should move to Supabase secrets

## Vision
Fully automated Business OS where AI agents handle:
- Campaign monitoring and optimization
- Client reporting (daily digest + per-client weekly reports)
- Meeting lifecycle (booking → review → qualification)
- Alert escalation (bounce rates, disconnected accounts, low warmup)
- But with human-in-the-loop for key decisions (pausing campaigns, client communication, meeting disputes)
