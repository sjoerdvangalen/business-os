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
├── research/                          # Client research .md files (1 per client)
│   └── FRTC.md, BETS.md, etc.
├── supabase/
│   ├── migrations/                    # SQL migrations (pushed with `npx supabase db push --linked`)
│   └── functions/                     # Edge functions (deployed with `npx supabase functions deploy`)
│       ├── sync-plusvibe-campaigns/    # Every 15 min via pg_cron
│       ├── sync-plusvibe-accounts/     # Every 15 min via pg_cron
│       └── sync-plusvibe-warmup/       # Daily at 00:00 UTC via pg_cron
└── sync/
    └── import-airtable.ts             # One-time import script (already run)
```

## Supabase Schema (17 tables)
- `clients` — Hub table, all data connects here via client_id
  - `onboarding_form` JSONB — onboarding questionnaire data
  - `research` JSONB — deep company research output
  - `strategy` JSONB — GTM strategy (ICPs, offers, PMF)
  - `onboarding_status` — pipeline stage tracking
- `campaigns` — Synced from PlusVibe (23 active campaigns)
- `email_accounts` — Synced from PlusVibe (4,386 accounts)
- `warmup_snapshots` — Daily warmup health per account
- `domains` — Email sending domains
- `contacts` — Leads (not yet synced from PlusVibe)
- `contracts`, `invoices` — Financial data (imported from Airtable)
- `meetings`, `opportunities` — CRM pipeline
- `sequences` — Email steps within campaigns (also stores generated copy with `offer_variant`, `target_icp`, `copy_status`)
- `email_messages` — Conversation history
- `daily_kpis` — Aggregated daily metrics
- `sync_log` — Tracks every sync operation
- `agent_memory` — AI agent context, research logs, review feedback

### Key Views
- `v_campaign_performance` — Campaign health status (HEALTHY/WARNING/CRITICAL)
- `v_inbox_health` — Email account health dashboard
- `v_lead_pipeline` — Lead funnel by status
- `v_sync_status` — Recent sync operations

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
