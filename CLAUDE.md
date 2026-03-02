# Business OS — CLAUDE.md

## Owner
Sjoerd van Galen — founder of **VGG Acquisition** (B2B lead generation agency).
Also co-runs **GTM Scaling** with partner Niels (same model, shared clients).
No fixed employees — works with VA's and freelancers as needed.

## What VGG Acquisition does
Cold email outreach campaigns for B2B clients. We manage the full infrastructure:
domains, email accounts, warmup, campaign setup, lead sourcing, and optimization.
Revenue model: retainer + meeting fees + commission on closed deals.

## Communication
- **Nederlands** for conversation and explanations
- **Engels** for code, comments, commit messages, variable names, database columns
- Direct, geen omhaal. Geen emojis tenzij gevraagd.

## Tech Stack
- **Database**: Supabase (project: `gjhbbyodrbuabfzafzry`, region: West EU Ireland)
- **Edge Functions**: Deno + TypeScript (Supabase Edge Functions)
- **Email Platform**: PlusVibe (workspace: `68f8e5d7e13f67d591c4f0a8`)
- **Automation**: Supabase pg_cron + Edge Functions (replacing n8n)
- **Airtable**: Legacy/archive only — GTM Scaling base `appaGhM19wYDA9PqB`
- **Communication**: Slack, Google Workspace
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
│   ├── migrations/                    # SQL migrations (pushed with `npx supabase db push --linked`)
│   └── functions/                     # Edge functions (deployed with `npx supabase functions deploy`)
│       ├── sync-plusvibe-campaigns/    # Every 15 min via pg_cron
│       ├── sync-plusvibe-accounts/     # Every 15 min via pg_cron
│       ├── sync-plusvibe-warmup/       # Daily at 00:00 UTC via pg_cron
│       ├── sync-plusvibe-leads/        # Every 15 min — lead catch-up sync
│       ├── webhook-receiver/          # Real-time PlusVibe webhook events
│       ├── reply-classifier/          # Classifies replies (called by webhook-receiver)
│       ├── lead-router/               # Routes classified leads (called by reply-classifier)
│       ├── aggregate-kpis/            # Daily KPI aggregation at 05:00 UTC
│       ├── campaign-monitor/          # Health checks every 15 min
│       └── domain-monitor/            # Deliverability check daily at 06:00 UTC
└── sync/
    └── import-airtable.ts             # One-time import script (already run)
```

## Supabase Schema (17 tables)
- `clients` — Hub table, all data connects here via client_id
  - `onboarding_form` JSONB — onboarding questionnaire data
  - `research` JSONB — deep company research output
  - `strategy` JSONB — GTM strategy (ICPs, offers, PMF)
  - `onboarding_status` — pipeline stage tracking
  - `report_frequency` — weekly/biweekly/monthly
- `campaigns` — Synced from PlusVibe (23 active campaigns)
  - `health_status` — HEALTHY/WARNING/CRITICAL/UNKNOWN (set by campaign-monitor)
  - `monitoring_notes` JSONB — array of recent health check results
- `email_accounts` — Synced from PlusVibe (4,386 accounts)
- `warmup_snapshots` — Daily warmup health per account
- `domains` — Email sending domains
  - `spf_status`, `dkim_status`, `dmarc_status` — set by domain-monitor
  - `health_status`, `avg_inbox_rate` — set by domain-monitor
- `contacts` — Leads (synced from PlusVibe every 15 min + real-time via webhooks)
  - `reply_classification` — NOT_INTERESTED/BLOCKLIST/FUTURE_REQUEST/MEETING_REQUEST/INFO_REQUEST/OOO/POSITIVE/NEUTRAL
  - `lead_status` — new/contacted/replied/interested/meeting_booked/not_interested/blocklisted
- `contracts`, `invoices` — Financial data (imported from Airtable)
- `meetings`, `opportunities` — CRM pipeline (opportunities auto-created by lead-router)
- `sequences` — Email steps within campaigns
  - `offer_variant`, `target_icp`, `copy_status` — generated copy tracking
  - `performance_score`, `auto_paused` — set by sequence-optimizer
- `email_messages` — Conversation history (real-time via webhooks)
- `daily_kpis` — Aggregated daily metrics (per campaign + per client)
- `sync_log` — Tracks every sync + agent operation
- `agent_memory` — AI agent context, alerts, classification logs, routing logs

### Key Views
- `v_campaign_performance` — Campaign health status (HEALTHY/WARNING/CRITICAL)
- `v_campaign_health_live` — Live 7-day rolling campaign health with computed alerts
- `v_client_health` — Client-level aggregated metrics (30-day)
- `v_domain_health` — Domain deliverability status (SPF/DKIM/DMARC + inbox rates)
- `v_inbox_health` — Email account health dashboard
- `v_lead_pipeline` — Lead funnel by status
- `v_sync_status` — Recent sync operations

### Agent Architecture
Real-time pipeline: PlusVibe webhooks → `webhook-receiver` → `reply-classifier` → `lead-router` → PlusVibe API + Slack
Monitoring agents run via pg_cron: `campaign-monitor` (*/15 min), `domain-monitor` (daily), `aggregate-kpis` (daily)

## Clients (active)
| Code | Name | What they do |
|------|------|-------------|
| FRTC | FRT Capital | Venture capital / investment fund |
| BETS | Better Socials | Social media marketing |
| AXIS | AXIND Software BV | Software development |
| SECX | SentioCX | AI-powered customer experience platform |
| REMR | Remote Rumble | Sales acquisition agency |
| PESC | Pescheck | International background checks platform |
| DOMS | Dovideq Medical Systems | Medical devices for minimally invasive surgery |
| DIGT | Digital Traffic | Digital marketing agency |
| PROL | Prolink | B2B services |
| OGNO | Ogno | Tech company |
| NEBE | NBE B.V. | B2B services |
| GTMS | GTM Scaling | Own company (with Niels) |
| QULF | Quality Lead Formula | Lead generation |
| LDEM | LDesignMedia | Design/media |

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

## Git & Commits
- Claude maakt automatisch commits na voltooide taken
- Commit messages in het Engels, kort en beschrijvend
- Format: `type: description` (e.g., `fix: convert campaigns.status from enum to text`)
- Altijd `Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>` toevoegen

## Important Commands
```bash
# Deploy edge functions
cd ~/business-os && npx supabase functions deploy sync-plusvibe-campaigns --no-verify-jwt
cd ~/business-os && npx supabase functions deploy sync-plusvibe-accounts --no-verify-jwt
cd ~/business-os && npx supabase functions deploy sync-plusvibe-warmup --no-verify-jwt

# Push migrations
cd ~/business-os && npx supabase db push --linked

# Run Deno scripts
/Users/sjoerdvangalen/.deno/bin/deno run --allow-net script.ts

# Test sync manually
curl -s -X POST 'https://gjhbbyodrbuabfzafzry.supabase.co/functions/v1/sync-plusvibe-campaigns' \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer <SERVICE_ROLE_KEY>' \
  -d '{}'
```

## Outbound Knowledge Base
**CRITICAL: For ALL outbound, cold email, targeting, copy, and GTM strategy decisions, ALWAYS read `knowledge/outbound-playbook.md` first.**

This playbook consolidates intelligence from GEX (Eric), Nick Abraham (Leadbird), Fivos Aresti, and the Cold Email v2 system. It contains:
- Core philosophy: offer > targeting > signal > messaging > infrastructure
- Signal-based outbound methodology
- Targeting & list building frameworks (About Us hack, responsibility-based targeting)
- The 10-minute research method (3 tiers)
- Email copy framework (50-90 words, 3-pass cutting, QA scoring 0-100)
- 5 campaign types (Custom Signal, Creative Ideas, Whole Offer, Fallback, Lead Magnet)
- Follow-up sequence philosophy (4 emails, value prop rotation)
- 25+ personalization line templates
- Infrastructure rules (25 emails/day/mailbox, 50/50 Google/Microsoft, etc.)
- ICP & objection mapping framework
- Operational benchmarks and unit economics

**Rule: Never generate outbound advice, copy, or strategy from generic knowledge. Always ground it in the playbook.**

## Client Research
Research files for each client are stored in `research/CLIENT_CODE.md`.
**When asked about a client, ALWAYS read `research/CLIENT_CODE.md` first for full context.**
These files contain: company profile, PMF assessment, GTM strategy, ICPs, offers, and campaign copy.

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
- PlusVibe leads sync not implemented yet (only campaigns + accounts + warmup)
- Airtable is archive only — no ongoing sync
- n8n still running but being phased out

## Vision
Fully automated Business OS where AI agents handle:
- Campaign monitoring and optimization
- Client reporting
- Alert escalation (bounce rates, disconnected accounts, low warmup)
- But with human-in-the-loop for key decisions (pausing campaigns, client communication)
