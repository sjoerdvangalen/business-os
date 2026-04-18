# Business OS Control Plane — Build Plan

## Context
Webapp control plane voor onboarding, approvals, execution en infra aansturen zonder Slack/Google Docs/EmailBison als dagelijkse primaire interface.

## Hoofddoel
1. clients zien met status/stage/approval
2. per client een duidelijke onboarding workflow zien
3. approvals in de webapp doen
4. execution review-ervaring krijgen
5. campaigns hiërarchisch zien (campaign → cell campaigns)
6. toggles voorbereiden zodat we later EmailBison niet meer hoeven te openen
7. fase-overgangen expliciet en bestuurbaar maken

## UX/Productregels
- Command Center = globale signalering / agenda / overzicht
- Client tabs = echte operationele besturing
- Onboarding-tab = workflow engine, geen statische pagina
- Execution Review = 1 operator view/doc voor targeting/data preview + messaging
- Workflowtaal: docs/pages mogen "Review" gebruiken, backend/actions/statuses blijven "Approval"
- Toggles NOOIT direct naar provider API vanuit de browser:
  - browser → Supabase desired action/state
  - backend reconcile/action queue
  - realtime terug naar UI

## Documenttitels
- CLIENT CODE | Strategy Review
- CLIENT FULL NAME | Strategy Review
- CLIENT CODE | Execution Review

## Navigatie

### Global nav
- Command Center
- Clients
- Execution
- Infrastructure
- Alerts
- Settings

### Client nav
- Overview
- Projects (replaces Onboarding)
- Strategy
- Execution Review
- Cells
- Campaigns
- Infrastructure
- Activity

---

## FASE 1 — FRONTEND STRUCTURE + ROUTING ✅

**Doel:** Route- en componentstructuur neerleggen zonder diepe data wiring.

**Geleverd:**
- Route skeletons voor alle pagina's
- Global sidebar met alle nav items
- Client-level tab navigation (8 tabs)
- Layout consistency (single sidebar in root layout)
- Placeholders met echte sectienamen

**Bestanden aangepast:**
- `app/components/Sidebar.tsx` — Execution + Settings toegevoegd
- `app/layout.tsx` — Root layout met sidebar (enige bron van sidebar)
- `app/(dashboard)/layout.tsx` — Sidebar verwijderd (was dubbel)
- `app/crm/layout.tsx` — Sidebar verwijderd (was dubbel)
- `app/settings/page.tsx` — Import fix voor Badge

**Routes beschikbaar:**
```
Global: /, /clients, /execution, /campaigns, /strategies, /crm/*, /alerts, /infrastructure, /tenants, /settings
Client: /clients/[code]/{overview,onboarding,strategy,execution-review,cells,campaigns,infrastructure,activity}
```

**Live:** https://business-os-frontend-lovat.vercel.app

---

## FASE 2 — CLIENTS OVERVIEW + COMMAND CENTER ✅

**Doel:** Echte globale operationele overview maken.

**Geleverd:**
1. Clients page met tabel: name, code, status, stage, approval, campaigns, inboxes, alerts
2. Command Center met KPI cards + recent clients list
3. Alle dashboard pagina's met tabs, client filter, pagination (100/500/1000):
   - Campaigns, Infrastructure, Meetings, Strategies, Pipeline, Alerts
4. Infrastructure: fetchAll zonder limiet — alle 5.900+ inboxes zichtbaar

**Nog te bouwen:**
- Agenda/timeline component (PortfolioTimeline) — wordt Sprint 2C

**Gebruik:** clients.status, clients.stage, clients.approval_status, workflow_metrics, campaigns/email_inboxes/alerts

**Niet doen:** approval acties muteren, provider toggles actief maken

---

## FASE 3 — CLIENT WORKSPACE + PROJECTS SHELL

**Doel:** Per client een echte workflow cockpit maken. Onboarding wordt een project type binnen Projects.

**Bouw:**
1. Client Overview pagina met blokken:
   - client summary
   - lifecycle/stage/approval
   - projects progress
   - cells summary
   - campaigns summary
   - inbox health
   - recent alerts
   - recent activity

2. Projects-tab als operationele container met List / Board / Calendar views:
   - Derived events uit bestaande tabellen (clients, campaign_cells, campaigns, meetings, alerts, gtm_strategies)
   - Project types: onboarding, launch_window, test_phase, infra_remediation, meeting_block, strategy_review
   - Event types: milestone, approval, launch, test_window, meeting, infra_alert, blocker, overdue
   - Read-only MVP: geen mutaties, alleen weergave van derived data

3. Onboarding workflow (bestaand) migreert naar `project_type: 'onboarding'` binnen Projects

---

## FASE 3B — PROJECTS LIST / BOARD / CALENDAR

**Doel:** Centrale planningslaag voor approvals, launches, testfases, meetings, infra alerts en blockers.

**Bouw:**
1. Projects List View:
   - Kolommen: naam, type, status, owner, due date, next milestone, blocker flag, linked cell/campaign
   - Sorteerbaar, filterbaar (owner, type, status, date range)
   - Owner filter graceful fallback: verbergen of "Unassigned" als owner_id ontbreekt

2. Projects Board View:
   - Kolommen: Backlog | In Progress | Review | Done | Blocked
   - Events gegroepeerd op ProjectEventStatus (UI layer, NIET cell status)
   - Cell status blijft canonical in campaign_cells

3. Projects Calendar View:
   - react-big-calendar met date-fns localizer
   - Month / Week / Day views
   - Event cards gekleurd op event_type + severity
   - Calendar sort: ascending (oudste eerst); List sort: descending (nieuwste eerst)

4. ProjectEventDrawer:
   - Detail paneel: titel, beschrijving, type, status, timeline, linked records
   - Read-only MVP: geen actieknoppen
   - Linked records als klikbare badges

5. PortfolioTimeline (Command Center):
   - Verticale timeline van alle client events
   - Gegroepeerd per client of per dag
   - Deelt exact dezelfde selectorlaag als Projects views

**Harde MVP regels:**
- Read-only: geen mutaties naar Supabase
- Geen nieuwe DB tabellen: projects / project_events bestaan alleen als frontend types
- Geen `health_alert` event_type: campaign health mapped naar `infra_alert`
- Geen supabaseAdmin forceren zonder noodzaak

---

## FASE 4 — APPROVAL UI + EXECUTION REVIEW PAGE

**Doel:** Approvals en reviewflow in de webapp brengen.

**Bouw:**
1. Execution Review page:
   - Deel 1: Targeting/Data Preview (segment, geo, keywords, preview URLs, counts)
   - Deel 2: Messaging (persona/vertical/solution/icp, ERIC, HUIDIG, CTA, signal-to-pain, proof, objection)

2. Approval actions UI voor: internal, external, sourcing, messaging
3. Backend endpoints gebruiken (gtm-approve) via nette API layer
4. Toon: wat je goedkeurt, waarop gebaseerd, audit trail, verplichte note bij reject

---

## FASE 5 — CAMPAIGN EXPLORER HIËRARCHIE ✅ (MVP)

**Doel:** Campaigns zichtbaar als boomstructuur zodat EmailBison niet nodig is.

**Geleverd:**
1. Campaigns tab met tabs (all/active/paused/completed/draft/archived), client filter, pagination
2. Expandable rows met sequences (email steps) en linked campaign_cells
3. Per row: status, emails_sent, replies, bounces, provider, cell_id

**Nog te bouwen:**
- Desired state / provider state sync indicator
- Inbox attachments per campaign
- Direct pause/resume toggle (Fase 6)

---

## FASE 6 — INFRA TAB + PROVIDER ACTION QUEUE MODEL

**Doel:** Infra bestuurbaar maken en basis leggen om EmailBison overbodig te maken.

**Bouw:**
1. Infrastructure tab per client:
   - readiness banner
   - domains table
   - inboxes table
   - warmup/health
   - provider sync status
   - recent failures
   - recent provider actions

2. Voorstel voor provider_actions model (minimale migratie indien nodig)
3. Toggle UI voorbereiden: pause/resume, attach/detach, retry sync
4. Toggles schrijven naar desired_state/queued action, niet direct provider API

---

## FASE 7 — REALTIME / FINAL POLISH

**Doel:** Alles voelbaar bestuurbaar maken.

**Bouw:**
1. Realtime refresh/subscriptions waar logisch
2. Loading / empty / error states
3. Activity feed polish
4. Duidelijke blocker states
5. Compacte operator UX
