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
- **Email Platform**: EmailBison (primair) — PlusVibe gearchiveerd (sync + webhook in _archive/)
- **Calendar**: Cal.com + GoHighLevel (multi-provider via webhook-meeting)
- **Automation**: Supabase pg_cron + Edge Functions (n8n gearchiveerd)
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
│   └── skills/                        # AI skills: solution_mapping, offer_dev, icp_persona, cell_design, emailbison_campaign
├── scripts/
│   ├── bulk-import-csv.ts             # Bulk CSV import (Clay, LinkedIn, manual, GMaps)
│   └── manual-sync-leads.js           # Manual PlusVibe lead sync
├── supabase/
│   ├── migrations/                    # SQL migrations (pushed with `npx supabase db push`)
│   └── functions/                     # Edge functions (see list below)
│       └── _archive/                  # 16 archived functions (not deployed)
└── _archive/docs/                     # Archived reference docs
```

## Edge Functions (28 active)

### EmailBison Sync (pg_cron)
- `sync-emailbison-accounts` — Every 15 min — email accounts + warmup scores
- `sync-emailbison-campaigns` — Every 15 min — campaign stats
- `sync-emailbison-sequences` — Hourly — sequence steps + KPIs
- `sync-domains` — Daily — domain health from email accounts

### Webhooks
- `webhook-emailbison` — Real-time EmailBison events (replies, bounces, sends, inbox status, warmup, DNC)
- `webhook-meeting` — Multi-provider meeting webhook (Cal.com, Calendly, GHL)
- `webhook-slack-interaction` — Slack button/modal handler for meeting reviews
- `webhook-jotform-intake` — Client onboarding intake form

### GTM Pipeline
- `gtm-research` + `gtm-research-poll` — Exa deep research (async)
- `gtm-synthesis` — OpenAI gpt-5.4 strategy synthesis
- `gtm-doc-render` — Google Docs render (internal/external)
- `gtm-approve` — Manual approval actions
- `gtm-messaging-doc` — Kimi messaging doc generation
- `gtm-aleads-source` — A-Leads sourcing
- `gtm-infra-status` — Infra readiness check
- `gtm-campaign-push` — EmailBison campaign creation + inbox attachment

### Processing
- `meeting-review` — Cron */5 min — Slack Block Kit review after meetings
- `campaign-monitor` — Health checks every 15 min
- `domain-monitor` — Deliverability check daily at 06:00 UTC
- `daily-digest` — Daily summary of all client activity (7:00 CET)
- `emailbison-campaign-create` — Create campaigns with standard settings + warmed inbox attachment
- `data-sourcing-orchestrator` — Full sourcing pipeline: source → validate → push
- `emailbison-pusher` — Push validated contacts to EmailBison campaigns

### Lead Generation
- `email-waterfall` — TryKitt email verification (patterns) + DNC check
- `ai-enrich-contact` — AI enrichment for contacts
- `process-gmaps-batch` — Process Google Maps scraper batches
- `find-contacts` — A-Leads contact finder for companies
- `validate-leads` — Enrow email validation

### Archived (in `_archive/`, not deployed)
sync-plusvibe-campaigns, sync-plusvibe-accounts, sync-plusvibe-warmup, sync-plusvibe-leads, sync-sequences, webhook-receiver, populate-daily-kpis, verify-deployment, gtm-crud-*, analyze-*, detect-anomalies, lead-router, aggregate-kpis, setup-cron-jobs, check-functions, webhook-calendar, webhook-debug

---

## GTM Skills (Python)

Reusable skills in `gtm/skills/` voor consistente GTM operaties. Alle skills gebruiken het canonieke model: `gtm_strategies` + `campaign_cells`.

### `emailbison_campaign` — Campaign Creation

**Doel**: Standaardiseerde Email Bison campaign creatie met warmed inbox attachment.

**Settings (business_os_default template)**:
- Max emails/day: 10,000
- Schedule: 08:00-17:00, Mon-Fri, Europe/Amsterdam
- Track opens: disabled (deliverability)
- Plain text: enabled
- Unsubscribe link: disabled (gebruik opt-out tekst)
- Prioritize followups: enabled

**Email Bison Spintax** (`patterns.py`):
- Spintax: `{Hi|Hallo|Goedendag}` voor willekeurige variatie
- Variabelen: `{FIRST_NAME}`, `{COMPANY_NAME}`, `{SENDER_FULL_NAME}` (UPPERCASE)
- Standaard NL: `{Hi|Hallo|Goedendag} {FIRST_NAME},`
- Standaard afsluiting: `Met vriendelijke groet,\n{SENDER_FULL_NAME}`
- Documentatie: https://help.emailbison.com/en/articles/spintax

**Gebruik**:
```bash
# Preview mode (check inboxes/settings)
./scripts/emailbison-campaign preview --client FRTC --name "FRTC | EN | Test"

# Create campaign
./scripts/emailbison-campaign create --client FRTC --name "FRTC | EN | Test" --mode immediate

# List patterns (aanhef/afsluiting/variables)
./scripts/emailbison-campaign patterns
```

**API**: `POST /functions/v1/emailbison-campaign-create`

**Payload met sequence steps**:
```json
{
  "client_code": "FRTC",
  "campaign_name": "FRTC | EN | Campaign Name",
  "sequence_steps": [
    {
      "order": 1,
      "email_subject": "quick question about {company_name}",
      "email_body": "Hi {first_name},\n\n...",
      "wait_in_days": 1,
      "thread_reply": false,
      "variant": false
    }
  ],
  "mode": "immediate",
  "cell_id": "uuid-of-campaign-cell"
}
```

**Waarom edge function?**
- Consistente API voor CLI, orchestrator, en externe systemen
- Centraliseert Email Bison API credentials (veiliger)
- Idempotent (upsert op provider_campaign_id)
- Auto-link naar campaign_cells bij cell_id meegegeven
- Ontvangt sequence steps via API (geen harde templates)

---

## Supabase Schema

19 tables live. PlusVibe gearchiveerd, EmailBison is primair.

### Core — Sync & Operations
- `clients` **[active — 19 rows]** — Hub table, all data connects here via client_id
  - `onboarding_form` JSONB
  - `status` — client_lifecycle enum (onboarding/running/scaling/paused/offboarding/churned)
  - `stage` — client_stage_type enum (intake/internal_approval/.../h1/f1/cta1/scaling)
  - `approval_status` — strategy_approval enum (draft/synthesized/.../external_approved)
  - `slack_channel_id` — Slack channel for this client's alerts/reviews
  - `workflow_metrics` JSONB — timing + subflow tracking
  - `dnc_entities` JSONB — do-not-contact MVP (legacy, canonical DNC in dnc_entities table)
  - `gtm_synthesis` JSONB — DEPRECATED_READONLY (canonical in gtm_strategies)
- `campaigns` **[active — 49 rows]** — Synced from EmailBison
  - `provider` — emailbison/manual (plusvibe legacy)
  - `health_status` — HEALTHY/WARNING/CRITICAL/UNKNOWN (set by campaign-monitor)
- `email_inboxes` **[active — 5,906 rows]** — Synced from EmailBison
  - `status` — connected/disconnected/bouncing/active/removed/paused/disabled
- `domains` **[active]** — Email sending domains (SPF/DKIM/DMARC status)
- `companies` **[active — 17k+ rows]** — Company/prospect table (canonical)
- `contacts` **[active — 27k+ rows]** — Unified person pool, reusable across clients. `company_id FK → companies`.
- `leads` **[active — 24k+ rows]** — Pure junction table: contact_id × campaign_id × client_id + status/tracking.
- `email_threads` **[active — 46k+ rows]** — Individual email records. Real-time via webhook-emailbison.
- `email_sequences` **[active]** — Email steps within campaigns (synced from EmailBison)
- `sync_log` **[active]** — Tracks every sync + agent operation
- `alerts` **[active]** — System alerts (inbox_disconnected, warmup events, etc.)
- `scraper_runs` **[active]** — Google Maps scraper run tracking
- `user_profiles` **[active]** — User profiles (dashboard auth)

### Meeting & CRM
- `meetings` **[active]** — Calendar meetings (real-time via webhook-meeting)
- `opportunities` **[active]** — CRM pipeline, auto-created on meeting booking

### Canonical GTM Data Model

**Two canonical tables — single source of truth for GTM:**

- `gtm_strategies` **[new — recreated 2026-04-04]** — Strategy container (per client, versioned)
  - JSONB: `solutions`, `pains`, `icp_segments`, `buyer_personas`, `entry_offers`, `proof_assets`, `messaging_direction`, `research_context`, `onboarding_context`
  - Status: draft → synthesized → internal_review → internal_approved → external_sent → external_iteration → external_approved
  - Contains strategy-level decisions. Does NOT contain hooks, subject lines, sample emails, CTA variants.

- `campaign_cells` **[new — extended 2026-04-04]** — Execution/test unit (per strategy, per combination)
  - Keys: `solution_key`, `icp_key`, `persona_key`, `offer_key` → linked to strategy via `strategy_id FK`
  - `snapshot` JSONB (immutable after creation) — frozen copy of strategy data at cell creation
  - `brief` JSONB, `runs` JSONB[] — test phases + variants
  - Status: draft → pilot_copy → H1_testing → H1_winner → F1_testing → F1_winner → CTA1_testing → soft_launch → scaling → killed
  - `runs[].variants[]` contains concrete hooks, subject lines, sample emails, CTA variants — not the cell definition itself

**No active standalone GTM tables** for solutions, icp_segments, buyer_personas, entry_offers, campaign_runs, campaign_variants. These were dropped and replaced by JSONB in gtm_strategies + campaign_cells.

### Data Sourcing & Suppression
- `sourcing_runs` **[active]** — Tracking per data sourcing run (company/contact/validation/push)
- `contact_validation_log` **[active]** — Audit trail per email validation (trykitt/enrow/omni results)
- `dnc_entities` **[active]** — Do Not Contact suppression (email/domain/contact_id, per-client or global)
  - `reason` — bounce/unsubscribe/spam_complaint/manual_request/replied/meeting_booked
  - Global unique index voor NULL client_id (PostgreSQL NULL != NULL fix)

### Messaging Approval Model

- **Strategy approval** = hard gate (client must approve before any outreach)
- **Messaging direction approval** = required before going live
- **Copy review** = bounded (client sees representative examples, not all live test variants)
- **Test logic** (H1/F1/CTA1 rotation) = managed internally, not client-facing

### Agent Architecture
- **Reply pipeline**: EmailBison webhooks → `webhook-emailbison` → stores in email_threads + contacts → DNC entities + Slack
- **Meeting pipeline**: Cal.com/Calendly/GHL webhook → `webhook-meeting` → meetings + opportunities + Slack
- **Monitoring**: `campaign-monitor` (*/15 min), `domain-monitor` (daily)
- **Syncs**: campaigns, inboxes (*/15 min), sequences (hourly), domains (daily) — all via EmailBison API

### Lead Generation Pipeline
```
Google Maps Scraper → process-gmaps-batch → companies table
  → find-contacts (A-Leads API) → contacts table
    → email-waterfall (TryKitt patterns) → verified email
      → validate-leads (Enrow) → email_validation_status
        → ai-enrich-contact (Kimi AI) → personalization data
          → emailbison-pusher → EmailBison campaigns
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
- **IDs**: All tables use UUID primary keys, provider records have `provider_campaign_id`/`provider_inbox_id` TEXT fields
- **Timestamps**: All tables have `created_at` and `updated_at` (auto-updated via trigger)
- **Sync pattern**: Edge function → EmailBison API → upsert into Supabase → log to sync_log
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

## Schema Validation (VERPLICHT na elke migratie of deploy)

**DB is leidend. Docs en code moeten matchen met live staat — niet met migratiegeschiedenis.**

Na elke `db push` of schema-wijziging: query live DB en vergelijk met CLAUDE.md. Update CLAUDE.md direct als er verschillen zijn.

```bash
source ~/.claude/load-env.sh

# Live tabeloverzicht
curl -s -X POST "https://api.supabase.com/v1/projects/gjhbbyodrbuabfzafzry/database/query" \
  -H "Authorization: Bearer ${SUPABASE_ACCESS_TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{"query": "SELECT table_name, table_type FROM information_schema.tables WHERE table_schema = '\''public'\'' ORDER BY table_type, table_name;"}' \
  | python3 -c "import json,sys; [print(r['table_type'][:4], r['table_name']) for r in json.load(sys.stdin)]"

# Actieve edge functions (filesystem)
ls ~/ai-projects/business-os/supabase/functions/ | grep -v "_archive\|_shared"
```

**Checklist:**
- [ ] Tabelnamen in CLAUDE.md matchen live DB (niet migratiegeschiedenis)
- [ ] Kolommen die code gebruikt bestaan live
- [ ] CLAUDE.md tabellijst bijgewerkt als er iets is gedropped of hernoemd
- [ ] supabase_client.py + edge functions refereren correcte tabelnamen

## Outbound Knowledge Base
**CRITICAL: For ALL outbound, cold email, targeting, copy, and GTM strategy decisions, ALWAYS read `docs/outbound-playbook.md` first.**

This playbook consolidates intelligence from GEX (Eric), Nick Abraham (Leadbird), Fivos Aresti, and the Cold Email v2 system.

**Rule: Never generate outbound advice, copy, or strategy from generic knowledge. Always ground it in the playbook.**

## Client Research
Research files are stored in `research/CLIENT_CODE-*.md`. Currently only SentioCX (SECX) has research files (8 files: campaigns matrix, prompts, test comparisons).
**When asked about a client with research files, ALWAYS read them first for full context.**

## Known Issues
- Cal.com/GHL webhook URLs need to be configured in the calendar platforms (tokens ready, URLs not set)
- `SLACK_TEST_CHANNEL` env var still set to `C0A50BSF8E8` (GTM Scaling) — unset when going live per client
