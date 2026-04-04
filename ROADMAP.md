# Business OS — Roadmap

> Gestandaardiseerde outbound machine met voorspelbare output.
> Supabase = primary business system of record.

---

## Systeem Visie

Je bouwt 3 blokken die samenkomen in execution:

```
┌─────────────────────────────────────────────────────────┐
│  STRATEGY ENGINE                                        │
│  Input → AI Synthesis → Gate (score ≥80) →             │
│  Client Validation → approved_strategy                  │
└─────────────────────────────────────────────────────────┘
         ↓ parallel zodra eerste ICP versie klaar
┌────────────────────┐    ┌────────────────────────────────┐
│  INFRA             │    │  DATA PIPELINE                 │
│  Domains/Inboxes   │    │  Hard filter → A-Leads →       │
│  Warmup tracking   │    │  AI scoring shortlist (≥65) →  │
│  DNS (SPF/DKIM)    │    │  Contacts → Enrow verify       │
└────────────────────┘    └────────────────────────────────┘
         ↓ convergeert
┌─────────────────────────────────────────────────────────┐
│  EXECUTION                                              │
│  Cells → Copy → H1 (300 del./variant) → F1 → CTA1     │
│  Kill logic per cell, deliverability gate eerst         │
└─────────────────────────────────────────────────────────┘
```

**Einddoel:** Fully automated Business OS waar AI agents campaign monitoring, client reporting, meeting lifecycle, en alert escalation afhandelen — met human-in-the-loop voor key decisions (pausing campaigns, client communication, meeting disputes).

---

## Wat al werkt (operationeel)

- PlusVibe + EmailBison syncs: campaigns, email_inboxes, leads, warmup, sequences, domains (*/15 min + daily)
- Reply pipeline: webhook-receiver/webhook-emailbison → email_threads + leads → PlusVibe + Slack
- Meeting lifecycle: Cal.com/GHL → webhook-meeting → review → Slack Block Kit → opportunity pipeline
- Campaign monitoring: health checks */15 min, domain checks dagelijks
- RLS op alle tabellen, API keys in Supabase secrets
- Database: 17 tabellen, 24k+ leads, 17k+ companies, 46k+ email threads
- 24 actieve edge functions (zie CLAUDE.md voor volledige lijst)
- GTM orchestrator (Python): strategy synthesis, cell design, lead sourcing, Google Docs output
- Lead gen pipeline: GMaps scraper → A-Leads → TryKitt/Enrow → AI enrich → PlusVibe

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
- [ ] n8n shadow mode (1 week data vergelijken) → daarna definitief uit

---

## Sprint 2 — GTM Skills + GTMS Pilot

**Doel**: Kern-loop bewijzen end-to-end. Niet breed, diep.

### Skills (in volgorde, een voor een reviewen)

Alle skills schrijven naar het canonieke model: `gtm_strategies` (JSONB containers) + `campaign_cells`.

```
#1  gtm-strategy-synthesis     Input → AI → gtm_strategies (solutions, icp_segments, personas JSONB)
#2  icp-segment-builder        Strategy → gtm_strategies.icp_segments met aleads_config v1 (JSON schema)
#3  internal-gate-review       Score-based rubric (100 pts) → APPROVE ≥80 / REJECT
#4  campaign-cell-designer     strategy → campaign_cells met immutable snapshot
#5  lead-sourcing-builder      aleads_config → hard filter → shortlist → AI scoring ≥65
#6  push-campaign-plusvibe     campaign_cells → PlusVibe via MCP → campaigns.plusvibe_id
```

### GTMS Pilot exit criteria

Loop is bewezen als:
- 1+ strategy gate_approved
- 2+ cells met snapshot
- 2+ campaigns in PlusVibe gesynchroniseerd
- 50+ leads verified geupload
- 1+ delivered volume per cell
- 1+ reply geclassificeerd + needs_review afgehandeld
- 1+ kill/iterate beslissing op echte data

### GTM Automation Inzichten (uit SentioCX case)

Reverse-engineered uit SECX: 4 personas (CX/OPS/TECH/CSUITE) × 6 verticals (SAAS/FIN/HLT/STF/MFG/GEN) = 24 cells.

**Cell naming**: `CLIENT|LANG|Solution|Vertical|Persona|Region` (e.g. SECX|EN|Route|SAAS|CX|NL)

**4-layer architectuur**: Input (client research) → Template Engine (persona/vertical templates) → Generation (24 cells auto) → Execution (A-Leads + TryKitt + PlusVibe)

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

## Sprint 4 — NRO en ELITS live

**Doel**: Eerste externe clients door de volledige pipeline.

Volgorde per client: strategy synthesis → gate → client approval → infra + data parallel → cells → pilot copy → H1 → F1 → CTA1 → scale/kill

---

## Sprint 5 — Reporting & Intelligence

**Pas bouwen als sprint 2-4 bewezen zijn.**

```
performance-analyzer     Na eerste H1 run met minimum sample
daily-digest             Na NRO/ELITS live (2+ clients actief)
copy-generator-v2        Na icp-segment-builder approved (Cold Email v2 rubric)
campaign-optimizer       Na 4+ weken data NRO/ELITS
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
A-Leads API (find-contacts) → contacts (company_id FK)
email-waterfall (TryKitt) → leads (email verified)
validate-leads (Enrow) → email_validation_status per lead
PlusVibe / EmailBison syncs → campaigns + leads (status updates)
Cal.com / GHL webhooks → meetings → opportunities
Slack → notificaties (Block Kit, per client channel)
```

---

## Tooling

```
Sourcing:        A-Leads API (aleads.py + find-contacts edge fn)
Verification:    TryKitt (email-waterfall) + Enrow (validate-leads)
Sending:         PlusVibe (primair), EmailBison (backup)
Calendar:        Cal.com + GoHighLevel
Database:        Supabase (PostgreSQL, West EU)
Dashboard:       Next.js (Vercel)
Notifications:   Slack Block Kit
GTM:             Python orchestrator (gtm/)
```
