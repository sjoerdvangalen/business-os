# Business OS — Roadmap

> Gestandaardiseerde outbound machine met voorspelbare output.
> Supabase = primary business system of record.

---

## CORE MODEL — EXECUTION BLUEPRINT V2 (APRIL 2026)

De pipeline produceert **geen** "strategie + losse campagnes".

De pipeline produceert:
- Volledige `persona × vertical × solution` matrix per client
- Skeleton `campaign_cells` (na synthesis + external approval)
- Sourcing feasibility per cell (vóór messaging)
- Formula-driven messaging framework per cell (ERIC + HUIDIG, na sourcing)
- Enriched, execution-ready `campaign_cells` in DB
- H1/F1/CTA1 test loop per cell — winners bepaald door data

### Authoritative testdiscipline (HIER, niet in AI-output)

```
H1:   300 delivered/variant  (hook frames — welk frame opent deuren)
F1:   500 delivered/variant  (email frameworks — welke structuur converteert)
CTA1: 300 delivered/variant  (CTA types — welke actie werkt)
```

CTA-lock tijdens H1/F1: alleen `info_send` of `case_study_send`.

### Write truth

```
gtm_strategies      = enige write target voor synthesis
campaign_cells      = enige write target voor execution units
clients.gtm_synthesis = DEPRECATED_READONLY
```

### Research files = benchmark, niet canonical

`research/CLIENT-*.md` bestanden (bijv. `research/SECX-*.md`) zijn **benchmark en campagnecontext** voor een specifieke client — prompts, test-vergelijkingen, hook-ideeën. Ze zijn **geen implementatie-instructie** en beschrijven niet hoe het systeem werkt. Pipeline-logica, tabelstructuur en send-regels staan hier in ROADMAP.md en CLAUDE.md — nergens anders.

### Cell identity (4 dimensies)

```
solution_key + icp_key + vertical_key + persona_key
icp_key    = ICP segment (firmographic profiel)
vertical_key = sector (staffing / saas / financial / healthcare / manufacturing)
```

Geen priority op cells. Qualification_framework doet de filtering. Winners via pilotdata.

---

## Systeem Visie

Je bouwt 3 blokken die samenkomen in execution:

```
┌─────────────────────────────────────────────────────────┐
│  STRATEGY ENGINE                                        │
│  Input → AI Synthesis → Client Validation →             │
│  approved_strategy (qualification_framework)             │
└─────────────────────────────────────────────────────────┘
         ↓ parallel zodra external_approved
┌────────────────────┐    ┌────────────────────────────────────┐
│  INFRA             │    │  DATA PIPELINE                     │
│  Domains/Inboxes   │    │  execution-review-doc fase 1 →     │
│  Warmup tracking   │    │  keyword_profiles (LLM) →          │
│  DNS (SPF/DKIM)    │    │  sourcing_approve →                 │
│                    │    │  A-Leads bulk (cookie-based) →      │
│                    │    │  Contacts → email verificatie       │
└────────────────────┘    └────────────────────────────────────┘
         ↓ convergeert
┌─────────────────────────────────────────────────────────┐
│  EXECUTION                                              │
│  Cells → ERIC+HUIDIG → H1 (300 del./variant) → F1 → CTA1│
│  Kill logic per cell, deliverability gate eerst          │
└─────────────────────────────────────────────────────────┘
```

**Einddoel:** Fully automated Business OS waar AI agents campaign monitoring, client reporting, meeting lifecycle, en alert escalation afhandelen — met human-in-the-loop voor key decisions (pausing campaigns, client communication, meeting disputes).

---

## Wat al werkt (operationeel)

- EmailBison syncs: campaigns, email_inboxes, sequences (*/15 min + hourly), domains (daily)
- Reply pipeline: webhook-emailbison → email_threads + contacts → DNC entities + Slack
- Meeting lifecycle: Cal.com/GHL → webhook-meeting → review → Slack Block Kit → opportunity pipeline
- Campaign monitoring: health checks */15 min, domain checks dagelijks
- RLS op alle tabellen, API keys in Supabase secrets
- Database: 19 tabellen, 24k+ leads, 17k+ companies, 46k+ email threads
- 31 actieve edge functions (zie CLAUDE.md voor volledige lijst)
- GTM orchestrator (Python): strategy synthesis, cell design, lead sourcing, Google Docs output
- GTM pipeline V2: jotform → research → synthesis (gtm_strategies) → doc render → external_approve → [parallel] cell-seed + execution-review-doc (fase 1) → sourcing_approve → [parallel] A-Leads bulk + messaging (ERIC+HUIDIG) → cell-enrich → campaign push
- Lead gen pipeline: GMaps scraper → A-Leads → TryKitt/Enrow → AI enrich → EmailBison
- PlusVibe volledig gearchiveerd (sync + webhook functions in _archive/)

---

## Sprint 1 — Foundation (in uitvoering)

**Doel**: Governance vastleggen, Apollo eruit, systeem live voor actieve klanten.

- [x] Governance DB migration: state machines, suppression model, snapshot trigger, classifier QA
- [x] Apollo volledig verwijderd (A-Leads = enige sourcing tool)
- [x] bos-leads / bos-reporting / bos-copy worktrees gearchiveerd, nuttige code gered
- [x] Worktrees aangemaakt: infra-skills, gtm-skills, data-cleanup, tenants/bos-integration
- [x] GTM canonical model: `gtm_strategies` + `campaign_cells` als enige twee actieve GTM tabellen
- [x] Legacy tabellen gedropped (solutions, buyer_personas, campaign_runs, campaign_variants, etc.)
- [ ] Calendar webhooks configureren: GTMS/BETS/DOMS (Cal.com), DIGT/PROL/NEBE (GHL)
- [ ] SLACK_TEST_CHANNEL verwijderen → clients.slack_channel_id per client activeren
- [x] n8n gearchiveerd — Supabase pg_cron + Edge Functions volledig operationeel

---

## Sprint 2 — GTM Pipeline V2 + GTMS Pilot

**Doel**: Execution Blueprint pipeline bewijzen end-to-end. Niet breed, diep.

### Pipeline status (edge functions)

Alle functies schrijven naar het canonieke model: `gtm_strategies` + `campaign_cells`.

```
#1  gtm-synthesis              [DONE v2]   Input → OpenAI → gtm_strategies (schema v2)
#2  gtm-doc-render             [DONE v2]   gtm_strategies → Google Doc (internal) → external
#3  gtm-campaign-cell-seed     [DONE]      campaign_matrix_seed → campaign_cells (skeleton) — op external_approve (parallel aan #4)
#4  gtm-execution-review-doc   [DONE]      keyword profiles + A-Leads squirrel preview per ICP — op external_approve (parallel aan #3)
                                           → fase 2 (messaging) appended door gtm-messaging-doc
#5  gtm-aleads-source          [DONE]      A-Leads bulk sourcing per ICP-segment — op sourcing_approve (parallel aan #6)
                                           Cookie-based auth (app.a-leads.co) — v1 Bearer API deprecated/broken
#6  gtm-messaging-doc          [DONE v2]   Sourcing-approved cells → ERIC + HUIDIG frameworks — op sourcing_approve (parallel aan #5)
#7  gtm-campaign-cell-enrich   [DONE]      messaging_output → campaign_cells.brief (status=ready) — op messaging_approve
#8  gtm-campaign-push          [DONE]      ready cells → EmailBison campaigns + inbox attachment
#9  emailbison-pusher          [DONE]      validated contacts → EmailBison campaigns via 2-step API
```

### GTMS Pilot exit criteria

Loop is bewezen als:
- 1+ strategy in `gtm_strategies` met status external_approved
- 5+ skeleton cells aangemaakt (status sourcing_pending of hoger)
- 2+ cells enriched (status ready) met hook_frameworks in brief
- 2+ campaigns in EmailBison gesynchroniseerd
- 50+ leads verified geüpload
- 1+ delivered volume per cell
- 1+ reply geclassificeerd + needs_review afgehandeld
- 1+ kill/iterate beslissing op echte data

### GTM Blueprint Architectuur (uit SentioCX case)

Benchmark: SECX → 4 personas (CX/OPS/TECH/CSUITE) × 6 verticals (SAAS/FIN/HLT/STF/MFG/GEN) = 24 cells.

**Cell identity**: `solution_key + icp_key + vertical_key + persona_key`
**Cell naming**: `CLIENT|EN|solution-key|icp-key|vertical-key|persona-key|geo` (e.g. SECX|EN|routing|mid-market-saas-nl|saas|cx|NLBE)

**Pipeline flow**: synthesis → skeleton cells → sourcing gate → ERIC+HUIDIG messaging → enrich cells → EmailBison

**Test sequence**: H1 (300 delivered/variant) → F1 (500 delivered/variant) → CTA1 (300 delivered/variant) → Scale/Kill

---

## Sprint 3 — Infra Skills + Tenants

**Doel**: Tenant lifecycle traceerbaar in business-os, infra monitoring actief.

```
#7  tenant-provision-log       PowerShell → email_inboxes (aparte status velden)
#8  warmup-monitor             EmailBison scores → warmup_status + Slack alert <70
#9  domain-rotation-planner    email_threads → rotation_status flagging
```

---

## Sprint 4 — Reporting & Intelligence

**Pas bouwen als sprint 2-3 bewezen zijn.**

```
performance-analyzer     Na eerste H1 run met minimum sample
daily-digest             Na 2+ clients actief in pipeline
copy-generator-v2        Na icp-segment-builder approved (Cold Email v2 rubric)
campaign-optimizer       Na 4+ weken data
client-report-generator  Na optimizer live
```

---

## Backlog (later)

- Multi-channel: LinkedIn (HeyReach), cold call (Salesfinity)
- LinkedIn About Us filtering (90-95% targeting accuracy — Nick Abraham methode)
- Volume planning calculator
- AI-native onboarding < 48u (form → live campaigns automatisch)
- Lead Magnet Campaign type (resource-first approach)
- google-doc-strategy, push-campaign-emailbison
- Account-centric data model — zie `_archive/docs/` voor eerdere voorstellen
- `docs/campaign-operation.md` — vervanging voor campaign-setup-playbook.md (aligned met huidig model)

---

## Kill Logic (non-negotiable)

```
Stap 1 — Deliverability gate EERST (per cell):
  Bounce > 3%            → STOP direct. Fix infra.
  Spam placement issues  → STOP direct. DNS check.
  Domain health slecht   → PAUSE domain. Roteer.

Stap 2 — Messaging/ICP gate (alleen na clean infra):
  Meeteenheid: delivered volume (niet sent)
  Evaluatie: per cell, nooit client-breed

  PILOT  → geen kill, observationeel
  H1     → min 300 delivered/variant → winner op PRR + kwaliteit
  F1     → min 500 delivered/variant → winner op reply inhoud
  CTA1   → min 300 delivered/variant → winner op meeting conversion
```

---

## Data Flow

```
Google Maps Scraper → process-gmaps-batch → companies
gtm-aleads-source (cookie-based bulk, op sourcing_approve) → companies + contacts tables
email-waterfall (OmniVerifier + TryKitt + Enrow fallback) → contacts (email verified + catchall flag) + DNC check
validate-leads (Enrow bulk) → contacts (email_validation_status)
emailbison-pusher (cell-scoped) → EmailBison campaigns + leads junction
EmailBison syncs → campaigns + email_inboxes (status updates)
webhook-emailbison → email_threads + contacts + DNC entities
Cal.com / GHL webhooks → meetings → opportunities
Slack → notificaties (Block Kit, per client channel)
```

---

## Tooling

```
Sourcing:        A-Leads cookie-based bulk (gtm-aleads-source) — find-contacts is legacy (broken v1 API)
Verification:    TryKitt (email-waterfall) + Enrow (validate-leads)
Sending:         EmailBison (primair) — PlusVibe gearchiveerd
Calendar:        Cal.com + GoHighLevel
Database:        Supabase (PostgreSQL, West EU)
Dashboard:       Next.js (Vercel)
Notifications:   Slack Block Kit
GTM:             Python orchestrator (gtm/)
```
