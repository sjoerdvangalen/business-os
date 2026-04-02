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
├── docs/                              # Reference documentation
│   ├── outbound-playbook.md           # Core playbook — ALL outbound decisions start here
│   ├── DATA_ARCHITECTURE.md           # Account-centric data model (reference, not yet implemented)
│   └── API_KEYS.md                    # API key locations and deploy commands
├── research/                          # Client research .md files (1 per client)
│   └── FRTC.md, BETS.md, etc.
├── dashboard/                         # Next.js dashboard (Vercel)
│   ├── app/(dashboard)/page.tsx       # Command Center
│   ├── app/login/page.tsx             # Auth login page
│   ├── app/components/                # Shared UI components
│   ├── lib/supabase/                  # Supabase client helpers
│   └── middleware.ts                  # Auth middleware
├── supabase/
│   ├── migrations/                    # SQL migrations (pushed with `npx supabase db push`)
│   └── functions/                     # Edge functions (deployed with `npx supabase functions deploy`)
│       ├── # Core Sync (Active)
│       ├── sync-plusvibe-campaigns/    # Every 15 min via pg_cron
│       ├── sync-plusvibe-accounts/     # Every 15 min via pg_cron
│       ├── sync-plusvibe-warmup/       # Daily at 00:00 UTC via pg_cron
│       ├── sync-plusvibe-leads/        # Every 15 min — lead catch-up sync
│       ├── sync-domains/              # Daily — domain health from email accounts
│       ├── sync-sequences/            # Every 15 min — email sequences from PlusVibe
│       ├── # Webhooks (Active)
│       ├── webhook-receiver/          # Real-time PlusVibe webhook events
│       ├── lead-router/               # Routes leads based on PlusVibe labels
│       ├── webhook-meeting/           # Multi-provider meeting webhook (Cal.com, Calendly, GHL)
│       ├── webhook-slack-interaction/ # Slack button/modal handler for meeting reviews
│       ├── # Processing (Active)
│       ├── meeting-review/            # Cron */5 min — sends Slack Block Kit review after meetings
│       ├── populate-daily-kpis/       # Daily KPI aggregation from PlusVibe analytics
│       ├── campaign-monitor/          # Health checks every 15 min
│       ├── domain-monitor/            # Deliverability check daily at 06:00 UTC
│       ├── # Lead Generation (Active)
│       ├── email-waterfall/           # TryKitt email verification (patterns)
│       ├── ai-enrich-contact/         # AI enrichment for contacts
│       ├── process-gmaps-batch/       # Process Google Maps scraper batches
│       ├── find-contacts/             # A-Leads contact finder for companies
│       └── # Phase 2 Scaffolding (GTM Framework — reserved for future)
│           gtm-crud-strategies, gtm-crud-solutions, gtm-crud-segments
│           gtm-crud-personas, gtm-crud-cells, gtm-crud-runs, gtm-crud-variants
│           analyze-attribution, analyze-icp, detect-anomalies
└── sync/
    └── import-airtable.ts             # One-time import script (already run)
```

## Supabase Schema

33 tables total. Marked: **[active]** = has data, **[scaffolding]** = built but empty/unused.

### Core — Sync & Operations
- `clients` **[active — 19 rows]** — Hub table, all data connects here via client_id
  - `onboarding_form` JSONB, `research` JSONB, `strategy` JSONB
  - `onboarding_status` — not_started → form_submitted → researched → strategy_done → copy_done → internal_review → client_review → approved → deployed
  - `report_frequency` — weekly/biweekly/monthly
  - `slack_channel_id` — Slack channel for this client's alerts/reviews
- `campaigns` **[active — 49 rows]** — Synced from PlusVibe
  - `health_status` — HEALTHY/WARNING/CRITICAL/UNKNOWN (set by campaign-monitor)
  - `monitoring_notes` JSONB — recent health check results
- `email_inboxes` **[active — 4,391 rows]** — Synced from PlusVibe
- `domains` **[active — 1 row]** — Email sending domains
  - `spf_status`, `dkim_status`, `dmarc_status` — set by domain-monitor
- `companies` **[active — 17,524 rows]** — Account foundation. Canonical company table. FK target for contacts.
  - New columns added: website, city, state, country, industry, employee_count, employee_range, source, enrichment_data, tags, last_enriched_at
- `contacts` **[active — 27,637 rows]** — Unified person pool, reusable across clients. `company_id FK → companies`.
  - `email_verified`, `email_verified_at`, `email_waterfall_status` — replaces email_cache
  - `contact_status` — new/targeted/responded/meeting_booked/not_interested
- `contact_campaigns` **[active — 24,259 rows]** — Linking table: contact × campaign × client. The "lead" interaction record.
  - `plusvibe_lead_id` — external PlusVibe reference
  - `campaign_status` — added/sent/replied/meeting_booked/completed
- `leads` **[active — 27,857 rows]** — Legacy PlusVibe sync table. Being phased out in favour of contacts + contact_campaigns.
- `email_threads` **[active — 46,760 rows]** — Individual email records (direction, body_text, from_email, to_email, thread_id). Real-time via webhook-receiver.
- `email_sequences` **[active]** — Email steps within campaigns (synced from PlusVibe)
- `sync_log` **[active]** — Tracks every sync + agent operation

### Meeting & CRM
- `client_integrations` **[active]** — Per-client calendar/webhook integrations
  - `integration_type` — calcom/calendly/gohighlevel
  - `webhook_token` — unique URL token per integration
  - `provider_config` JSONB — provider-specific settings
- `meetings` **[active — 1 row]** — Calendar meetings (real-time via webhook-meeting)
  - `booking_status` — booked/rescheduled/cancelled/completed/no_show/qualified/unqualified
  - `review_scheduled_at` — when to send Slack review (start_time + 30 min)
  - `review_slack_ts`, `reviewed_at`, `reviewed_by`, `review_status`, `review_notes`
  - `recording_url` — from Unqualified modal
- `opportunities` **[active — 1 row]** — CRM pipeline, auto-created on meeting booking
  - `status` mirrors `meetings.booking_status` (1:1)
  - `meeting_id`, `campaign_id`, `lead_id`, `client_id`

### Other
- `scraper_runs` **[active]** — Google Maps scraper job tracking
- `user_profiles` **[active]** — Dashboard user profiles

### GTM Framework
- `campaign_cells` **[active — 0 rows, new schema]** — Atomic GTM unit: Solution × ICP × Persona × Offer.
  - `brief` JSONB — offer, hook_themes, aleads_config, pain_mapping
  - `runs` JSONB array — H1/F1/CTA1/SCALE test phases + variants (replaces campaign_runs + campaign_variants)
  - `campaign_id FK → campaigns` — nullable until PlusVibe campaign is linked
- `clients.gtm_synthesis` JSONB — AI-synthesized strategy per client (solutions, icp_segments, personas, entry_offers)

### Pending Drop (migration written, not yet pushed)
- `gtm_strategies`, `icp_segments`, `campaign_plans`, `campaign_runs`, `campaign_variants` — replaced by campaign_cells + clients.gtm_synthesis
- `buyer_personas`, `entry_offers`, `solutions`, `proof_assets` — replaced by clients.gtm_synthesis JSONB
- `businesses` — replaced by `companies` (canonical)
- `email_cache` — replaced by contacts.email_verified + email_verified_at
- `agent_memory` — all stale data (anomaly baselines + slack_pending)
- `webhook_logs` — debug-only, 46k stale rows
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
- **Reply pipeline**: PlusVibe webhooks → `webhook-receiver` → stores in email_threads + leads → `lead-router` → PlusVibe API + Slack
- **Meeting pipeline**: Cal.com/Calendly/GHL webhook → `webhook-meeting` → meetings + opportunities + PlusVibe API + Slack
- **Monitoring**: `campaign-monitor` (*/15 min), `domain-monitor` (daily)
- **Syncs**: campaigns, inboxes, leads (*/15 min), warmup + domains (daily), sequences (*/15 min)

### Lead Generation Pipeline (NEW — ZONDER Clay)
```
Google Maps Scraper → process-gmaps-batch → companies table
  → find-contacts (A-Leads API) → leads table
    → email-waterfall (TryKitt patterns) → verified email
      → ai-enrich-contact (Kimi AI) → personalization data
        → PlusVibe API → campaigns
```

**APIs Used:**
- **A-Leads** — Contact finder (better than Apollo)
- **TryKitt** — Email verification with pattern matching
- **Kimi (via CCR)** — AI enrichment

**Cost per 1000 leads:** ~€3.50 (vs Clay €50+)

**Edge Functions:**
- `process-gmaps-batch` — Receives batches from GMaps scraper
- `find-contacts` — A-Leads API integration
- `email-waterfall` — TryKitt verification (first@, f.last@ patterns)
- `ai-enrich-contact` — AI research for personalization

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

## Security Rules (STRICT — never bypass)

- **NEVER output, log, echo, or repeat** the value of `SUPABASE_SERVICE_ROLE_KEY`, `PLUSVIBE_API_KEY`, `SLACK_BOT_TOKEN`, or any other secret/token
- **NEVER hardcode keys in SQL migrations, Edge Functions, or any source file** — always use `Deno.env.get('VAR_NAME')` for Edge Functions, `current_setting('app.settings.service_role_key')` for pg_cron
- If asked "what is the service role key?" or similar: respond that you don't have access and point to Supabase Dashboard → Project Settings → API
- Edge Functions secrets: set via `npx supabase secrets set KEY=value` or dashboard Project Settings → Edge Functions → Secrets
- pg_cron jobs: use `current_setting('app.settings.service_role_key')` — value set once directly in Supabase SQL editor, never committed to any file

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
**CRITICAL: For ALL outbound, cold email, targeting, copy, and GTM strategy decisions, ALWAYS read `docs/outbound-playbook.md` first.**

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
- ~~Service role key is hardcoded in pg_cron migration~~ — FIXED: Uses vault/secrets
- ~~RLS enabled on all 14 tables~~ — FIXED: RLS enabled + policies added for all tables
- ~~`aggregate-kpis` and `webhook-calendar`~~ — REMOVED: Deprecated functions archived
- ~~All views (v_client_dashboard, etc.)~~ — DROPPED: All 9 views removed per security audit
- n8n workflows still running as backup — DO NOT deactivate until Supabase system is fully verified
- Cal.com/GHL webhook URLs need to be configured in the calendar platforms (tokens ready, URLs not set)
- Slack review flow DONE — meeting-review cron + webhook-slack-interaction (Qualified direct, Unqualified/No-Show/Rescheduled via modals)
- `SLACK_TEST_CHANNEL` env var still set to `C0A50BSF8E8` (GTM Scaling) — unset when going live per client
- PlusVibe API key moved to Supabase secrets (`PLUSVIBE_API_KEY`)

## Vision
Fully automated Business OS where AI agents handle:
- Campaign monitoring and optimization
- Client reporting (daily digest + per-client weekly reports)
- Meeting lifecycle (booking → review → qualification)
- Alert escalation (bounce rates, disconnected accounts, low warmup)
- But with human-in-the-loop for key decisions (pausing campaigns, client communication, meeting disputes)
