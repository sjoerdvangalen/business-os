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
- Onboarding
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

## FASE 2 — CLIENTS OVERVIEW + COMMAND CENTER 🔄

**Doel:** Echte globale operationele overview maken.

**Bouw nu:**
1. Clients page met tabel:
   - client name/code
   - lifecycle status
   - stage
   - approval status
   - active campaigns
   - healthy inboxes
   - open alerts
   - last updated

2. Command Center pagina met:
   - KPI cards
   - blockers list
   - approvals queue
   - live campaigns warning list
   - agenda/timeline view per client

3. Agenda / timeline component:
   toon per client milestones:
   - intake
   - strategy review
   - client review
   - sourcing approval
   - messaging approval
   - launch
   - h1 / f1 / cta1 / scaling

**Gebruik:** clients.status, clients.stage, clients.approval_status, workflow_metrics, campaigns/email_inboxes/alerts

**Niet doen:** approval acties muteren, provider toggles actief maken

---

## FASE 3 — CLIENT OVERVIEW + ONBOARDING WORKFLOW

**Doel:** Per client een echte workflow cockpit maken.

**Bouw:**
1. Client Overview pagina met blokken:
   - client summary
   - lifecycle/stage/approval
   - onboarding progress
   - cells summary
   - campaigns summary
   - inbox health
   - recent alerts
   - recent activity

2. Onboarding-tab als workflow engine met 3 macro-kolommen:
   - Strategy (Intake → Research → Synthesis → Internal Review → Client Review)
   - Infrastructure (Provider → Domains → Inboxes → Warmup → Infra Ready)
   - Launch (Skeleton Cells → Execution Review → Sourcing → Messaging → Enrich → Launch → Live)

3. Per card: status, owner, dependency, evidence count, last updated, CTA
4. Detail drawer per stap: summary, evidence, decision area, audit log

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

## FASE 5 — CAMPAIGN EXPLORER HIËRARCHIE

**Doel:** Campaigns zichtbaar als boomstructuur zodat EmailBison niet nodig is.

**Bouw:**
1. Campaigns tab met expandable hierarchy:
   - campaign group / provider campaign
   - onderliggend cell campaigns
   - eventueel inbox attachments als 3e niveau

2. Per row: status, desired state, provider state, sync status, inbox count, delivered, replies, meetings, last sync
3. Filters: live/paused/failed, by stage, by client, by provider state

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
