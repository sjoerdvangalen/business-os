# Business OS — CLAUDE.md

## Document Authority

```
Document                         Leidend voor
═════════════════════════════════╪══════════════════════════════════════════
CLAUDE.md                        Current repo truth / operating context
ROADMAP.md                       Build order + backlog + future phases
docs/outbound-playbook.md        Outbound source of truth (targeting/copy/offers)
docs/cloud-deploy-protocol.md    Deployment procedure (DB + edge functions)
docs/campaign-setup-playbook.md  Handmatige campaign operations (deels legacy)
docs/API_KEYS.md                 Key locaties en deploy commands
```

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
- **Email Platform**: PlusVibe (workspace: `68f8e5d7e13f67d591c4f0a8`) + EmailBison (backup)
- **Calendar**: Cal.com + GoHighLevel (multi-provider via webhook-meeting)
- **Automation**: Supabase pg_cron + Edge Functions (replacing n8n)
- **Communication**: Slack (per-client channels + #vgg-alerts), Google Workspace
- **GTM Orchestrator**: Python (gtm/) — strategy synthesis, cell design, lead sourcing
- **Code**: GitHub
- **Runtime**: Deno at `/Users/sjoerdvangalen/.deno/bin/deno`

## Project Structure
```
~/business-os/
├── CLAUDE.md                          # This file
├── ROADMAP.md                         # Build order + backlog + future phases
├── docs/
│   ├── outbound-playbook.md           # Core playbook — ALL outbound decisions start here
│   ├── cloud-deploy-protocol.md       # Deployment procedure (DB + edge functions)
│   ├── campaign-setup-playbook.md     # Campaign operations (deels legacy)
│   └── API_KEYS.md                    # API key locations and deploy commands
├── research/                          # Client research (currently SECX only)
│   └── SECX-*.md (8 files)           # SentioCX campaign matrix, prompts, test comparisons
├── dashboard/                         # Next.js dashboard (Vercel)
│   ├── app/(dashboard)/page.tsx       # Command Center
│   ├── app/components/                # Shared UI components
│   └── lib/supabase/                  # Supabase client helpers
├── gtm/                               # GTM automation (Python)
│   ├── orchestrator.py                # Main orchestrator (Phase A: strategy, Phase B: data pipeline)
│   ├── lib/                           # Supabase client, A-Leads, enrichment, Google, Slack
│   └── skills/                        # AI skills: solution_mapping, offer_dev, icp_persona, cell_design
├── scripts/
│   ├── bulk-import-csv.ts             # Bulk CSV import (Clay, LinkedIn, manual, GMaps)
│   └── manual-sync-leads.js           # Manual PlusVibe lead sync
├── supabase/
│   ├── migrations/                    # SQL migrations (pushed with `npx supabase db push`)
│   └── functions/                     # Edge functions (see list below)
│       └── _archive/                  # 16 archived functions (not deployed)
└── _archive/docs/                     # Archived reference docs
```

## Edge Functions (24 active)

### Core Sync
- `sync-plusvibe-campaigns` — Every 15 min via pg_cron
- `sync-plusvibe-accounts` — Every 15 min via pg_cron
- `sync-plusvibe-warmup` — Daily at 00:00 UTC
- `sync-plusvibe-leads` — Every 15 min — lead catch-up sync
- `sync-domains` — Daily — domain health from email accounts
- `sync-sequences` — Every 15 min — email sequences from PlusVibe
- `sync-emailbison-accounts` — EmailBison email accounts sync
- `sync-emailbison-campaigns` — EmailBison campaigns sync
- `sync-emailbison-sequences` — EmailBison sequence steps sync

### Webhooks
- `webhook-receiver` — Real-time PlusVibe webhook events
- `webhook-emailbison` — Real-time EmailBison events (replies, bounces, opens)
- `webhook-meeting` — Multi-provider meeting webhook (Cal.com, Calendly, GHL)
- `webhook-slack-interaction` — Slack button/modal handler for meeting reviews

### Processing
- `meeting-review` — Cron */5 min — sends Slack Block Kit review after meetings
- `populate-daily-kpis` — Daily KPI aggregation
- `campaign-monitor` — Health checks every 15 min
- `domain-monitor` — Deliverability check daily at 06:00 UTC
- `daily-digest` — Daily summary of all client activity (7:00 CET)
- `verify-deployment` — Infrastructure verification

### Lead Generation
- `email-waterfall` — TryKitt email verification (patterns)
- `ai-enrich-contact` — AI enrichment for contacts
- `process-gmaps-batch` — Process Google Maps scraper batches
- `find-contacts` — A-Leads contact finder for companies
- `validate-leads` — Enrow email validation

### Archived (16 in `_archive/`, not deployed)
gtm-crud-strategies, gtm-crud-solutions, gtm-crud-segments, gtm-crud-personas, gtm-crud-cells, gtm-crud-runs, gtm-crud-variants, analyze-attribution, analyze-icp, detect-anomalies, lead-router, aggregate-kpis, setup-cron-jobs, check-functions, webhook-calendar, webhook-debug

## Supabase Schema

17 tables. Marked: **[active]** = has data, **[new]** = recently created/recreated.

### Core — Sync & Operations
- `clients` **[active — 19 rows]** — Hub table, all data connects here via client_id
  - `onboarding_form` JSONB, `research` JSONB
  - `phase` — client_phase enum (0_onboarding → ...)
  - `slack_channel_id` — Slack channel for this client's alerts/reviews
  - **Legacy mirror fields** (not canonical, do not use in new code): `strategy` JSONB, `icp_segments` JSONB, `campaign_cells` JSONB, `phase_log` JSONB, `gate_status`, `gate_score`, `gate_feedback`
- `campaigns` **[active — 49 rows]** — Synced from PlusVibe + EmailBison
  - `provider` — plusvibe/emailbison/manual
  - `health_status` — HEALTHY/WARNING/CRITICAL/UNKNOWN (set by campaign-monitor)
- `email_inboxes` **[active — 4,391 rows]** — Synced from PlusVibe + EmailBison
- `domains` **[active]** — Email sending domains (SPF/DKIM/DMARC status)
- `companies` **[active — 17k+ rows]** — Company/prospect table (canonical; `businesses` was a transitional table, dropped in migration 20260402000003)
- `contacts` **[active — 27k+ rows]** — Unified person pool, reusable across clients. `company_id FK → companies`.
- `leads` **[active — 24k+ rows]** — Linking table: contact × campaign × client. The interaction record.
- `email_threads` **[active — 46k+ rows]** — Individual email records. Real-time via webhook-receiver.
- `email_sequences` **[active]** — Email steps within campaigns (synced from PlusVibe)
- `sync_log` **[active]** — Tracks every sync + agent operation
- `alerts` **[active]** — System alerts
- `scraper_runs` **[active]** — Google Maps scraper run tracking
- `user_profiles` **[active]** — User profiles (dashboard auth)

### Meeting & CRM
- `meetings` **[active]** — Calendar meetings (real-time via webhook-meeting)
- `opportunities` **[active]** — CRM pipeline, auto-created on meeting booking

### Canonical GTM Data Model

**Two canonical tables — single source of truth for GTM:**

- `gtm_strategies` **[new — recreated 2026-04-04]** — Strategy container (per client, versioned)
  - JSONB: `solutions`, `pains`, `icp_segments`, `buyer_personas`, `entry_offers`, `proof_assets`, `messaging_direction`, `research_context`, `onboarding_context`
  - Status: draft → synthesized → gate_review → gate_approved → client_sent → client_iteration → client_approved
  - Contains strategy-level decisions. Does NOT contain hooks, subject lines, sample emails, CTA variants.

- `campaign_cells` **[new — extended 2026-04-04]** — Execution/test unit (per strategy, per combination)
  - Keys: `solution_key`, `icp_key`, `persona_key`, `offer_key` → linked to strategy via `strategy_id FK`
  - `snapshot` JSONB (immutable after creation) — frozen copy of strategy data at cell creation
  - `brief` JSONB, `runs` JSONB[] — test phases + variants
  - Status: draft → pilot_copy → H1_testing → H1_winner → F1_testing → F1_winner → CTA1_testing → soft_launch → scaling → killed
  - `runs[].variants[]` contains concrete hooks, subject lines, sample emails, CTA variants — not the cell definition itself

**No active standalone GTM tables** for solutions, icp_segments, buyer_personas, entry_offers, campaign_runs, campaign_variants. These were dropped in migration 20260402000004 and replaced by JSONB in gtm_strategies + campaign_cells.

**`clients` is NOT a canonical GTM data container.** GTM-related JSONB fields on clients (`strategy`, `icp_segments`, `campaign_cells`, `phase_log`) are legacy mirror fields — not canonical, not to be used by new code.

### Messaging Approval Model

- **Strategy approval** = hard gate (client must approve before any outreach)
- **Messaging direction approval** = required before going live
- **Copy review** = bounded (client sees representative examples, not all live test variants)
- **Test logic** (H1/F1/CTA1 rotation) = managed internally, not client-facing

### Agent Architecture
- **Reply pipeline**: PlusVibe/EmailBison webhooks → `webhook-receiver`/`webhook-emailbison` → stores in email_threads + leads → PlusVibe API + Slack
- **Meeting pipeline**: Cal.com/Calendly/GHL webhook → `webhook-meeting` → meetings + opportunities + PlusVibe API + Slack
- **Monitoring**: `campaign-monitor` (*/15 min), `domain-monitor` (daily)
- **Syncs**: campaigns, inboxes, leads (*/15 min), warmup + domains (daily), sequences (*/15 min)

### Lead Generation Pipeline
```
Google Maps Scraper → process-gmaps-batch → businesses table
  → find-contacts (A-Leads API) → contacts table
    → email-waterfall (TryKitt patterns) → verified email
      → validate-leads (Enrow) → email_validation_status
        → ai-enrich-contact (Kimi AI) → personalization data
          → PlusVibe API → campaigns
```

**APIs Used:**
- **A-Leads** — Contact finder (better than Apollo)
- **TryKitt** — Email verification with pattern matching
- **Enrow** — Email finding and secondary verification
- **Kimi (via CCR)** — AI enrichment

**Cost per 1000 leads:** ~€3.50 (vs Clay €50+)

## Clients (active)

```
Code  Name                    What they do                              Calendar
══════╪═══════════════════════╪═════════════════════════════════════════╪═════════════
FRTC  FRT Capital             Venture capital / investment fund         —
BETS  Better Socials          Social media marketing                   Cal.com
AXIS  AXIND Software BV       Software development                     —
SECX  SentioCX                AI-powered customer experience platform   —
REMR  Remote Rumble           Sales acquisition agency                  —
PESC  Pescheck                International background checks           —
DOMS  Dovideq Medical Systems Medical devices (minimally invasive)      Cal.com
DIGT  Digital Traffic         Digital marketing agency                   GHL
PROL  Prolink                 B2B services                              GHL
OGNO  Ogno                    Tech company                              —
NEBE  NBE B.V.                B2B services                              GHL
GTMS  GTM Scaling             Own company (with Niels)                   Cal.com
QULF  Quality Lead Formula    Lead generation                           —
LDEM  LDesignMedia            Design/media                              —
```

### Paused/Archived
INPE (Inplenion ERP), NELA (Next Level Amazon), SOVA (SOV Agency), SOCT (Social Trends), POUL (PoultryPlan)

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
- **Sync pattern**: Edge function → PlusVibe/EmailBison API → upsert into Supabase → log to sync_log
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
Research files are stored in `research/CLIENT_CODE-*.md`. Currently only SentioCX (SECX) has research files (8 files: campaigns matrix, prompts, test comparisons).
**When asked about a client with research files, ALWAYS read them first for full context.**

## Known Issues
- n8n workflows still running as backup — DO NOT deactivate until Supabase system is fully verified
- Cal.com/GHL webhook URLs need to be configured in the calendar platforms (tokens ready, URLs not set)
- `SLACK_TEST_CHANNEL` env var still set to `C0A50BSF8E8` (GTM Scaling) — unset when going live per client
