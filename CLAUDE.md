# Business OS — CLAUDE.md

## Document Authority

```
Document                         Leidend voor
═════════════════════════════════╪══════════════════════════════════════════
CLAUDE.md                        Current repo truth / operating context
ROADMAP.md                       Build order + backlog + future phases
docs/outbound-playbook.md        Outbound source of truth (targeting/copy/offers)
docs/cloud-deploy-protocol.md    Deployment procedure (DB + edge functions)
docs/API_KEYS.md                 Key locaties en deploy commands
research/CLIENT-*.md             Benchmark + context — NOOIT implementatie-instructie
```

> **HARD RULE:** No implementation work may use `docs/campaign-setup-playbook.md`,
> `docs/pipeline-edge-functions-plan.md`, or `research/` files as primary instruction.
> Those documents are deprecated/archived or benchmark-only context.
> Only `CLAUDE.md` and `ROADMAP.md` are authoritative for architecture decisions.
>
> **Research files (`research/SECX-*.md` etc.) are benchmark and campaign context —
> they describe a specific client's prompts and test comparisons, not system architecture.
> Never derive pipeline logic, table structure, or send rules from them.**

## EXECUTION MODEL V2 (APRIL 2026)

### Write truth
- `gtm_strategies` = **enige write target** voor synthesis output
- `clients.gtm_synthesis` = **DEPRECATED_READONLY** — backwards-compat read only, nooit meer als write target
- Geen enkele nieuwe functie schrijft primair naar `clients.gtm_synthesis`
- Alle nieuwe reads lezen uit `gtm_strategies`

### Pipeline
De GTM pipeline produceert een **execution blueprint**, geen "strategie + losse campagnes":

```
intake → exa research → synthesis (gtm_strategies) → internal doc → external doc
  → [parallel] skeleton cells (campaign_cells, status=sourcing_pending)
             + execution review doc fase 1 (keyword profiles + A-Leads preview)
  → sourcing_approve (operator reviews Execution Review)
  → [parallel] bulk sourcing per ICP-segment (A-Leads)
             + messaging per cell (ERIC + HUIDIG hooks)
  → execution review doc fase 2 (messaging appended)
  → messaging_approve
  → enrichment (messaging terugschrijven in cells, status=ready)
  → checkLiveTestReadiness (G0 gate: deliverability + sourcing + messaging QA) → live execution (H1 → F1 → CTA1)
```

### Execution rules (non-negotiable)
- **Geen priority op cell niveau** — `qualification_framework` doet de filtering
- **Volledige matrix** — alle geldige persona × vertical × solution combos in `campaign_matrix_seed`
- **Sourcing vóór definitieve messaging** — cells die niet haalbaar zijn krijgen geen messaging
- **Skeleton cells eerst, enrichment na sourcing + messaging**
- **Winners bepaald via pilotdata** (H1/F1/CTA1) — nooit via synthesis

### Cell identity
- `solution_key + icp_key + vertical_key + persona_key`
- `icp_key` ≠ `vertical_key` — dit zijn aparte dimensies (vertical = sector, ICP = firmographic profiel)

### Deprecated concepten
- `clients.gtm_synthesis` / `clients.strategy_synthesis` als write target
- `priority_score` op cells
- Handmatige campaign selectie
- "Top ICP combinations" in synthesis
- `pilot_test_logic` / sample sizes in AI-output (authoritative in ROADMAP.md)

### Campaign Archetypes

Het archetype bepaalt de campaign architectuur — niet de hook zelf. Archetype kiest de sourcing strategie, list-type, en activatievolgorde van cells.

**matrix_driven:**
- Source: synthesis → campaign_matrix_seed
- Cell creation: synthesis → matrix → cells → sourcing → formula_resolver → messaging
- Default hooks: signal_observation, problem_hypothesis, benchmark_gap
- Default offers: outcome_led, problem_led
- Default CTAs: info_send, case_study_send (CTA-lock during H1/F1)
- Sourcing: A-Leads bulk per ICP segment

**data_driven:**
- Source: dataset (SDE-register, CSV, imports)
- Cell creation: dataset → account variables → diagnostic cells → diagnostic_resolver → custom_variables → send
- No synthesis-matrix dependency. No A-Leads sourcing.
- May reuse client-level strategy context (tone, proof boundaries, compliance).
- Default hooks: data_observation, benchmark_gap
- Default offers: diagnostic_led, insight_led
- Default CTAs: diagnostic_offer, soft_confirm

**signal_driven:**
- Source: companies with active buy signals
- Cell creation: signal-filtered sourcing → cells → formula_resolver → messaging
- Default hooks: signal_observation
- Default offers: outcome_led
- Default CTAs: direct_meeting (Tier 1), info_send (Tier 2)
- Hogere kosten per contact, hogere verwachte conversie.

CTA-lock tijdens H1/F1: alleen `info_send` of `case_study_send` als `cta_variant` (ROADMAP.md authoritative).

### Filter Types

Three distinct filter types — never conflate:

- **firmographic** = static: sector, FTE, geo (e.g. SaaS, 50-500 FTE, NL/BE)
- **technographic** = tool stack prerequisite/filter (e.g. Salesforce Service Cloud, Epic, Bullhorn)
- **live signal** = active trigger/event — evidence of urgency now (e.g. hiring spike, funding round, G2 reviews)

**Critical:** Salesforce Service Cloud = technographic filter, NOT a live signal.
This distinction determines signal_tier and cta_variant.

### Signal Tiers (bepalen hook_variant, offer_variant, cta_variant)

Signal tier is dynamisch: starts at 3 (baseline at seeding), can upgrade to 2 or 1 after sourcing/enrichment.

```
Tier 1   High intent trigger — actief signaal, bewijs van urgentie nu
         (recent funding, active hiring for target role, product launch, churn reviews)
         → hook_variant = signal_observation
         → offer_variant = outcome_led
         → cta_variant = direct_meeting, kortere sequence

Tier 2   Warm trigger / problem evidence — indirect bewijs van relevant probleem
         (headcount groei, tech stack hints, G2 reviews, nieuws)
         → hook_variant = signal_observation of benchmark_gap
         → offer_variant = outcome_led of problem_led
         → cta_variant = info_send of case_study_send, standaard sequence

Tier 3   Qualified no trigger — firmografisch fit, geen zichtbaar signaal
         (juiste sector/grootte, niets specifieks gevonden)
         → fallback variant combinatie: hook_variant = problem_hypothesis of proof_led,
           offer_variant = problem_led of outcome_led,
           cta_variant = soft_confirm of info_send

Tier 4   Experimental hypothesis — onzeker fit, nieuwe vertical of ICP
         → Observational only, kleine batch, geen volume tot data bewijst
```

Tier wordt bepaald tijdens sourcing / enrichment. Stuurt: `hook_variant`, `offer_variant`, `cta_variant`, welke cells eerst live gaan, en hoe kill logic werkt (Tier 3 cells krijgen ruimere pilotperiode).

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

## Terminology Freeze

Use exactly — never deviate:

Use                 | Never use
--------------------|---------------------------------------------------
campaign_archetype  | campaign_family, motion
signal_tier         | signal_tier_default
hook_variant        | —
offer_variant       | offer_mode
cta_variant         | send_mode, cta_direction
matrix_driven       | matrix_solution
data_driven         | data_led
signal_driven       | —

Hook variants: signal_observation, data_observation, problem_hypothesis, poke_the_bear, benchmark_gap, proof_led
Offer variants: outcome_led, problem_led, insight_led, proof_led, diagnostic_led
CTA variants: direct_meeting, info_send, case_study_send, diagnostic_offer, soft_confirm

proof_led dual use — explicit definitions:
- hook_variant = proof_led → opening starts with proof, case, benchmark, or proof point
- offer_variant = proof_led → value prop is framed via proof, precedent, or social proof
(hook = how you open; offer = how you position the value)

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
│   └── API_KEYS.md                    # API key locations and deploy commands
├── research/                          # Client research (currently SECX only)
│   └── SECX-*.md                      # SentioCX campaign matrix, prompts per persona, test comparisons
├── frontend/                          # Next.js dashboard (Vercel)
│   ├── app/(dashboard)/page.tsx       # Command Center
│   ├── app/components/                # Shared UI components
│   └── lib/supabase/                  # Supabase client helpers
├── gtm/                               # GTM automation (Python)
│   ├── orchestrator.py                # Main orchestrator (Phase A: strategy, Phase B: data pipeline)
│   ├── lib/                           # Supabase client, A-Leads, enrichment, Google, Slack
│   └── skills/                        # AI skills: solution_mapping, offer_dev, icp_persona, cell_design, emailbison_campaign
├── scripts/
│   └── bulk-import-csv.ts             # Bulk CSV import (Clay, LinkedIn, manual, GMaps)
├── supabase/
│   ├── migrations/                    # SQL migrations (pushed with `npx supabase db push`)
│   └── functions/                     # Edge functions (see list below)
│       └── _archive/                  # 20 archived functions (not deployed)
└── _archive/docs/                     # Archived reference docs
```

## Edge Functions (35 active, 4 legacy in active dir awaiting archive)

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
- `gtm-synthesis` — OpenAI o4-mini strategy synthesis (gtm_synthesis_v2 schema) → writes to `gtm_strategies`
- `gtm-doc-render` — Google Docs render (internal 14-sectie / external) — reads from `gtm_strategies`
- `gtm-approve` — Manual approval gate (internal/external/messaging/sourcing) — triggers downstream
- `gtm-campaign-cell-seed` — Skeleton cells from `campaign_matrix_seed` → `campaign_cells` (status=sourcing_pending) — triggered on external_approve (parallel to execution-review-doc)
- `gtm-execution-review-doc` — Execution Review doc fase 1: keyword profiles + A-Leads squirrel counts + preview URLs per ICP-segment — triggered on external_approve (parallel to cell-seed); fase 2 appended by gtm-messaging-doc
- `gtm-aleads-source` — A-Leads bulk sourcing per ICP segment: companies via `bulk/company-search` + contacts via `bulk/advanced-search` (person_search, cookie-based auth) — triggered on sourcing_approve (parallel to gtm-messaging-doc)
- `gtm-messaging-doc` — Per-cell ERIC + HUIDIG messaging (Kimi kimi-k2-5) for all sourcing-approved cells — triggered on sourcing_approve (parallel to gtm-aleads-source)
- `gtm-campaign-cell-enrich` — Writes approved messaging back to `campaign_cells.brief` (status=ready) — triggered on messaging_approve
- `gtm-infra-status` — Infra readiness check
- `gtm-campaign-push` — EmailBison campaign creation + inbox attachment
- `gtm-gate-notify` — Slack notification for approval gates

### Processing
- `meeting-review` — Cron */5 min — Slack Block Kit review after meetings
- `campaign-monitor` — Health checks every 15 min
- `domain-monitor` — Deliverability check daily at 06:00 UTC
- `daily-digest` — Daily summary of all client activity (7:00 CET)
- `emailbison-campaign-create` — Create campaigns with standard settings + warmed inbox attachment
- `data-sourcing-orchestrator` — Full sourcing pipeline: source → validate → push
- `emailbison-pusher` — Push validated contacts to EmailBison campaigns

### Infra
- `namecheap-purchase-domain` — Domain purchase automation
- `namecheap-set-nameservers` — Nameserver configuration

### Lead Generation
- `email-waterfall` — Multi-step email verification: 90-day cache → DNC L1/L2/L3 → OmniVerifier confirm + catchall detection → TryKitt patterns → Enrow email find fallback
- `ai-enrich-contact` — AI enrichment for contacts
- `process-gmaps-batch` — Process Google Maps scraper batches
- `find-contacts` — Legacy A-Leads contact finder (uses broken v1 REST API). Not used in the automated pipeline; `gtm-aleads-source` handles contact discovery via cookie-based bulk person_search.
- `validate-leads` — Enrow email validation

### Archived (in `_archive/`, not deployed)
sync-plusvibe-campaigns, sync-plusvibe-accounts, sync-plusvibe-warmup, sync-plusvibe-leads, sync-sequences, webhook-receiver, populate-daily-kpis, verify-deployment, gtm-crud-*, analyze-*, detect-anomalies, lead-router, aggregate-kpis, setup-cron-jobs, check-functions, webhook-calendar, webhook-debug

**Legacy still in active directory (to be moved to `_archive/`):** `populate-daily-kpis`, `sync-sequences`, `verify-deployment`, `webhook-receiver`

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
  - `provider` — emailbison/manual (plusvibe rows exist as legacy data; no new plusvibe writes)
  - `health_status` — HEALTHY/WARNING/CRITICAL/UNKNOWN (set by campaign-monitor)
  - `cell_id` — FK to `campaign_cells` (links EB campaign to its execution cell)
- `email_inboxes` **[active — 5,906 rows]** — Synced from EmailBison
  - `status` — connected/disconnected/bouncing/active/removed/paused/disabled
- `domains` **[active]** — Email sending domains (SPF/DKIM/DMARC status)
- `companies` **[active — 17k+ rows]** — Company/prospect table (canonical)
- `contacts` **[active — 27k+ rows]** — Unified person pool, reusable across clients. `company_id FK → companies`.
  - `email_verified_at` — timestamp of last verification (90-day cache)
  - `email_catchall` — boolean flag from OmniVerifier (null = unchecked, true = catch-all domain, false = confirmed deliverable)
- `leads` **[active — 24k+ rows]** — Pure junction table: contact_id × campaign_id × client_id + status/tracking.
  - `cell_id` — FK to `campaign_cells` (links lead to the cell it was sourced for)
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

- `gtm_strategies` **[active]** — Strategy container (per client, versioned)
  - Primary column: `synthesis JSONB` (gtm_synthesis_v2 schema — written by gtm-synthesis)
  - `synthesis` contains: `solutions`, `qualification_framework`, `icp_segments` (with `.key`), `buyer_personas`, `persona_map`, `persona_start_verbs`, `verticals`, `vertical_map`, `vertical_customer_terms`, `vertical_expert_terms`, `proof_assets`, `value_prop_formula`, `campaign_matrix_seed`, `messaging_direction`, `research_context`
  - Status: draft → synthesized → internal_review → internal_approved → external_sent → external_iteration → external_approved
  - Does NOT contain hooks, subject lines, sample emails, CTA variants, or test counts.

- `campaign_cells` **[active]** — Execution/test unit (per strategy, per combination)
  - Cell identity: `solution_key + icp_key + vertical_key + persona_key` (4 separate dimensions)
  - `cell_code` format: `CLIENT|EN|solution-key|icp-key|vertical-key|persona-key|geo`
  - `icp_key` matches `icp_segments[].key` (firmographic segment slug)
  - `vertical_key` matches `verticals[].key` (sector slug) — NEVER equate with icp_key
  - `snapshot` JSONB (immutable after creation) — frozen copy of strategy data at cell creation
  - `signal_tier` — INTEGER 1–4, set at seeding (default 3), upgrades after sourcing/enrichment
  - `hook_variant` — which hook opens the email (signal_observation / data_observation / problem_hypothesis / poke_the_bear / benchmark_gap / proof_led)
  - `offer_variant` — how the value is positioned (outcome_led / problem_led / insight_led / proof_led / diagnostic_led)
  - `cta_variant` — what action is requested (direct_meeting / info_send / case_study_send / diagnostic_offer / soft_confirm)
  - `brief` JSONB skeleton (na cell-seed): `target_job_title_families`, `trigger_event_classes`, `aleads_config`, `customer_term`, `expert_term`, `geo`
  - `brief` JSONB enriched (na messaging_approve): adds `hook_frameworks` (ERIC + HUIDIG), `trigger_alignment`, `signal_to_pain`, `proof_angle`, `objection_angle`, `feasibility_notes`, `estimated_addressable_accounts`, `test_plan` ({ h1_variants, f1_variants, cta1_variants }), `qa` ({ score, layer1_passed, layer1_failures, evaluated_at })
  - Status: sourcing_pending → sourcing_failed | messaging_revision → ready → H1_testing → H1_winner → F1_testing → F1_winner → CTA1_testing → soft_launch → scaling → killed
  - `messaging_revision` = messaging generated but failed QA or operator review; cell not yet ready, awaiting correction or regeneration

**No active standalone GTM tables** for solutions, icp_segments, buyer_personas, entry_offers, campaign_runs, campaign_variants. These were dropped and replaced by JSONB in gtm_strategies + campaign_cells.

### Data Sourcing & Suppression
- `sourcing_runs` **[active]** — Tracking per data sourcing run (company/contact/validation/push)
- `contact_validation_log` **[active]** — Audit trail per email validation (trykitt/enrow/omni results)
- `dnc_entities` **[active]** — Do Not Contact suppression (email/domain/contact_id, per-client or global)
  - Level 1: `client_id IS NULL` — global bounces / universal suppressions
  - Level 2: `client_id = X` — client-specific suppressions
  - Level 3: `reason IN ('replied', 'meeting_booked')` — positive-reaction DNC (client-scoped only)
  - `reason` — bounce/unsubscribe/spam_complaint/manual_request/replied/meeting_booked
  - Global unique index voor NULL client_id (PostgreSQL NULL != NULL fix)

### Messaging Approval Model

- **Strategy approval** = hard gate (client must approve before any outreach)
- **Messaging direction approval** = required before going live
- **Copy review** = bounded (client sees representative examples, not all live test variants)
- **Test logic** (H1/F1/CTA1 rotation) = managed internally, not client-facing

### Test Phase Semantics

```
G0   = readiness gate: deliverability ok + sourcing ok + messaging QA ok + variant sets ready
H1   = hook_variant test         300 delivered/variant
F1   = offer_variant + framework test  500 delivered/variant
CTA1 = cta_variant test          300 delivered/variant
```

CTA-lock tijdens H1/F1: alleen `info_send` of `case_study_send` als `cta_variant` waarden.

### Write Flow (non-negotiable)

- `formula_resolver.ts` is pure/read-only logic — schrijft geen state weg
- `gtm-messaging-doc` schrijft NIET naar campaign_cells execution state — schrijft naar review artifact
- `gtm-campaign-cell-enrich` schrijft pas na messaging_approve naar campaign_cells (`hook_variant`, `offer_variant`, `cta_variant`, `brief.test_plan`, `brief.qa`)

### Agent Architecture
- **Reply pipeline**: EmailBison webhooks → `webhook-emailbison` → stores in email_threads + contacts → DNC entities + Slack
- **Meeting pipeline**: Cal.com/Calendly/GHL webhook → `webhook-meeting` → meetings + opportunities + Slack
- **Monitoring**: `campaign-monitor` (*/15 min), `domain-monitor` (daily)
- **Syncs**: campaigns, inboxes (*/15 min), sequences (hourly), domains (daily) — all via EmailBison API

### Lead Generation Pipeline
```
Google Maps Scraper → process-gmaps-batch → companies table

A-Leads bulk sourcing (gtm-aleads-source):
  bulk/company-search → companies table
  bulk/advanced-search (person_search) → contacts table

Contact enrichment & validation:
  → email-waterfall (OmniVerifier + TryKitt + Enrow fallback) → verified email + catchall flag
    → validate-leads (Enrow bulk validation for existing emails) → email_validation_status
      → ai-enrich-contact (Kimi AI) → personalization data
        → emailbison-pusher (cell-scoped) → EmailBison campaigns
```

**APIs Used:**
- **A-Leads** — Company + contact bulk sourcing via cookie-based `app.a-leads.co` endpoints. v1 REST API is deprecated/broken.
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

- **NEVER output, log, echo, or repeat** the value of `SUPABASE_SERVICE_ROLE_KEY`, `SLACK_BOT_TOKEN`, or any other secret/token (`PLUSVIBE_API_KEY` is legacy/archived — do not use)
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
source ~/.claude/scripts/load-env.sh

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
Research files are stored in `research/CLIENT_CODE-*.md`. Currently only SentioCX (SECX) has research files (campaigns matrix, prompts per persona, test comparisons — run `ls research/SECX-*.md` for current set).

**Role: benchmark + context only.** Research files describe a client's specific prompts, test comparisons, and campaign ideas. They are NOT implementation instructions. Pipeline logic, table structure, and send rules are defined in `CLAUDE.md` and `ROADMAP.md` — not derived from research files.

**When asked about a client with research files, ALWAYS read them first for campaign context.**

## Known Issues
- Cal.com/GHL webhook URLs need to be configured in the calendar platforms (tokens ready, URLs not set)
- `SLACK_TEST_CHANNEL` env var still set to `C0A50BSF8E8` (GTM Scaling) — unset when going live per client

---

## Deployment Context

### Railway
- **Account Token**: `RAILWAY_ACCOUNT_TOKEN` (kan nieuwe services aanmaken)
- **Project Token**: `RAILWAY_TOKEN` (bestaande services alleen)
- **Project**: scintillating-energy (`2ad5a85b-9b6f-4044-9cff-ab1eec2cb3bf`)
- **Environment**: production (`eb353851-1db7-4a6a-8782-227bcbf81568`)
- **Use case**: Deploy NocoDB, Redis, Postgres, etc.

### Supabase
- **Project**: `gjhbbyodrbuabfzafzry`
- **URL**: `https://gjhbbyodrbuabfzafzry.supabase.co`
- **Use case**: PostgreSQL database, Auth, Edge Functions

### Services
- **Frontend**: Vercel (business-os-frontend-lovat.vercel.app)
- **NocoDB**: Railway (to be deployed)
- **Database**: Supabase PostgreSQL
