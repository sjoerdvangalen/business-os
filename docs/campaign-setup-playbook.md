# Campaign Setup Playbook — Operationeel Stappenplan

> Stap-voor-stap handleiding voor het opzetten van een nieuwe campagne in Business OS. Dit is de operationele uitwerking van de strategische richtlijnen in `outbound-playbook.md`.

---

## Overzicht: De 6 Stappen

```
Stap 1: GTM Strategy scaffolding      (Supabase GTM Framework)
Stap 2: Campaign cell design          (Template B v2)
Stap 3: Lead sourcing                 (GMaps / Apollo / Handmatig)
Stap 4: Email copy & value props      (SentioCX integratie)
Stap 5: PlusVibe upload & config      (Campaign launch)
Stap 6: Monitoring & optimalisatie    (Business OS dashboards)
```

---

## Stap 1: GTM Strategy Scaffolding

**Doel:** De strategische basis leggen in Supabase (tabellen: `gtm_strategies`, `solutions`, `icp_segments`, `buyer_personas`).

### 1.1 Strategy aanmaken

```bash
# Via Supabase SQL Editor of edge function
curl -X POST https://gjhbbyodrbuabfzafzry.supabase.co/functions/v1/gtm-crud-strategies \
  -H "Authorization: Bearer <token>" \
  -d '{
    "action": "create",
    "data": {
      "client_id": "<uuid>",
      "name": "Q2 2025 Enterprise Outreach",
      "description": "Focus op SaaS bedrijven 50-200 FTE met CX pain points",
      "status": "draft"
    }
  }'
```

### 1.2 Solution definiëren

Wat lossen we op? Gebruik de SentioCX value prop structuur:

```sql
INSERT INTO solutions (strategy_id, name, description, outcome_statement, price_point)
VALUES (
  '<strategy_uuid>',
  'AI-Powered CX Analytics',
  'Real-time customer sentiment analysis en automated escalation',
  'Reduce churn by 23% binnen 90 dagen',
  '€2,500-5,000/month'
);
```

### 1.3 ICP Segmenten vastleggen

Per campagne cel definieer je:

```sql
INSERT INTO icp_segments (strategy_id, name, criteria, company_size, industries, priority_score)
VALUES (
  '<strategy_uuid>',
  'SaaS Scale-ups met CX Teams',
  '50-200 FTE, hiring CX roles, recent funding',
  '[50, 200]',
  '["SaaS", "Cloud Software"]',
  9
);
```

### 1.4 Buyer Personas koppelen

Gebruik de 4 SentioCX persona archetypes:

```
CX   = Customer Experience Director (focus: satisfaction, NPS)
OPS  = Operations VP (focus: efficiency, cost reduction)
TECH = CTO/Tech Lead (focus: integration, scalability)
CSUITE = C-level (focus: revenue impact, churn reduction)
```

```sql
INSERT INTO buyer_personas (strategy_id, name, title_keywords, pain_points, decision_authority)
VALUES (
  '<strategy_uuid>',
  'CX Director',
  '["Head of Customer Experience", "CX Director", "VP Customer Success"]',
  '["High churn", "Low NPS", "Support ticket overload"]',
  'high'
);
```

---

## Stap 2: Campaign Cell Design

**Doel:** Een specifieke campagne cel definiëren met unieke code en targeting.

### 2.1 Campaign Cell structuur

De campaign cell code volgt dit patroon:

```
CLIENT|LANG|Solution|Segment|Persona|Region

Voorbeeld:
SECX|EN|AI-CX-Analytics|SaaS-Scaleups|CX|EU
SECX|EN|AI-CX-Analytics|SaaS-Scaleups|OPS|EU
```

### 2.2 Campaign Cell aanmaken

```sql
INSERT INTO campaign_cells (
  strategy_id,
  solution_id,
  segment_id,
  persona_id,
  cell_code,
  name,
  trigger_events,
  hook_themes,
  priority_score,
  daily_send_limit,
  status
) VALUES (
  '<strategy_uuid>',
  '<solution_uuid>',
  '<segment_uuid>',
  '<persona_uuid>',
  'SECX|EN|AI-CX|SaaS|CX|EU',
  'SECX EN SaaS CX EU Q2',
  '["hiring_cx_role", "recent_funding", "high_churn_signal"]',
  '["churn_reduction", "nps_improvement", "automation_roi"]',
  9,
  50,
  'draft'
);
```

### 2.3 Template B v2 invullen

Voor elke cel maak je een Google Doc (via orchestrator of handmatig):

```
CAMPAIGN CELL BRIEF — Template B v2
════════════════════════════════════

CELL CODE:     SECX|EN|AI-CX|SaaS|CX|EU
CLIENT:        SentioCX
SOLUTION:      AI-Powered CX Analytics
PERSONA:       CX Director

TRIGGER EVENTS:
- Hiring CX roles (LinkedIn job posts)
- Recent funding (Crunchbase)
- High churn signal (G2 reviews mentioning churn)

HOOK THEMES:
1. "Companies like [competitor] reduced churn 23% in 90 days"
2. "Your support team is drowning — here's the lifeline"
3. "The NPS gap between you and [leader]"

VALUE PROPOSITION (SentioCX output):
[Plak hier de gegenereerde value prop uit Stap 4]

PERSONALIZATION VELDEN:
- {{company.name}}
- {{company.funding_round}}
- {{company.cx_team_size}}
- {{prospect.title}}
- {{trigger.signal}}
```

---

## Stap 3: Lead Sourcing

**Doel:** Bedrijven en contacten verzamelen via de lead pipeline.

### 3.1 Methode selecteren

```
Methode              │ Wanneer gebruiken                    │ Output
═════════════════════╪══════════════════════════════════════╪══════════════════════════
Google Maps Scraper  │ Lokale bedrijven, geo-targeting      │ companies table
Apollo API           │ Specifieke titels, technische filters │ Handmatige import
A-Leads API          │ Contact discovery op company list    │ leads table (verified)
Handmatig            │ Named accounts, kleine lijsten       │ Direct CSV import
```

### 3.2 Google Maps Scraper → Business OS

```bash
# 1. Scraper draaien (separaat project)
cd ~/ai-projects/scrapers/google-maps-scraper
python3 -m src.scraper --query "SaaS companies Amsterdam" --limit 100

# 2. Output wordt automatisch verwerkt door edge function:
# POST /functions/v1/process-gmaps-batch
# → companies table (17,524+ bedrijven)
```

### 3.3 Contact discovery (A-Leads API)

```bash
# Via orchestrator Phase B of directe API call
curl -X POST https://gjhbbyodrbuabfzafzry.supabase.co/functions/v1/find-contacts \
  -H "Authorization: Bearer <token>" \
  -d '{
    "cell_id": "<campaign_cell_uuid>",
    "company_ids": ["<uuid1>", "<uuid2>"],
    "target_titles": ["CX Director", "Head of Customer Experience"]
  }'

# Output: leads table met a-leads_data JSONB
```

### 3.4 Email verificatie (TryKitt waterfall)

```bash
# Automatisch via edge function:
# POST /functions/v1/email-waterfall

Pattern volgorde:
1. first@company.com
2. f.last@company.com
3. first.last@company.com
4. firstlast@company.com

Verified emails → leads.email_verified = true
```

### 3.5 AI Enrichment (Kimi via CCR)

```bash
# POST /functions/v1/ai-enrich-contact

Enrichment velden:
- personalization_hook (observatie voor opening)
- company_context (recent news, funding)
- tech_stack (indien relevant)
- recommended_approach (CX/OPS/TECH/CSUITE angle)
```

---

## Stap 4: Email Copy & SentioCX Integratie

**Doel:** Value propositions genereren en omzetten naar cold email copy.

### 4.1 SentioCX Master Prompt gebruiken

Gebruik de SentioCX prompt generator (zie `~/Downloads/sentio-prompts/`):

```
INPUT voor SentioCX:
- Client: SentioCX
- Vertical: SaaS (of FIN/HLT/STF/MFG/GEN)
- Persona: CX (of OPS/TECH/CSUITE)
- Trigger: hiring_cx_role / recent_funding / high_churn

OUTPUT: Value proposition (3 bullets, 12-16 woorden, specifiek per combo)
```

### 4.2 Email structuur (volgens outbound-playbook)

```
Subject: 2-5 woorden, lowercase, geen punctuatie

Opening: Observatie over prospect (trigger signal)
        Niet: "Ik ben Sjoerd van..."
        Wel: "Zag dat jullie een Head of CX aan het inhuren zijn..."

Body:    < 75 woorden
        - 1 zin over hun situatie (vanuit research)
        - 1 zin over mogelijk gevolg (pain)
        - 1 zin over hoe jullie dit oplossen (value prop)

CTA:     Één concrete vraag
        Niet: "Plan een meeting in"
        Wel: "Is dit iets wat jullie nu aan het evalueren zijn?"
```

### 4.3 Sequence opzetten (3 stappen)

```
Stap 1 (Dag 0):  Initiële outreach — observatie + value prop + CTA
Stap 2 (Dag 3):  Follow-up — andere hoek, korter, "bumping this up"
Stap 3 (Dag 8):  Breakup — definitief, laat deur open
```

### 4.4 Copy naar Supabase opslaan

```sql
INSERT INTO campaign_variants (
  cell_id,
  variant_code,
  sequence_step,
  subject_line,
  body_template,
  personalization_fields,
  ab_test_group
) VALUES (
  '<cell_uuid>',
  'SECX-SaaS-CX-v1',
  1,
  'quick question on your CX hiring',
  'Saw you''re hiring a {{prospect.title}} — typically means {{company.name}} is scaling customer-facing teams fast.

Quick question: are you also upgrading the analytics behind those interactions, or is that planned for later?

We help similar SaaS teams cut response times by 40% without adding headcount.

Is this on your radar?',
  '["prospect.title", "company.name"]',
  'A'
);
```

---

## Stap 5: PlusVibe Upload & Config

**Doel:** De campagne live zetten in PlusVibe (email platform).

### 5.1 Campaign aanmaken in PlusVibe

```bash
# Via API of handmatig in PlusVibe UI

Campaign naam: SECX | EN | SaaS CX EU Q2
Campaign type: Cold Outreach
Daily limit:   50 (matcht campaign_cells.daily_send_limit)

Connected inboxes: [Selecteer 5-10 warmed up inboxes uit email_inboxes table]
```

### 5.2 Leads uploaden naar PlusVibe

```bash
# Export uit Supabase naar CSV
psql -h <host> -U postgres -d postgres -c "
  SELECT
    l.email_verified as email,
    l.first_name,
    l.last_name,
    c.name as company_name,
    l.personalization_hook,
    l.a_leads_data->>'title' as title
  FROM leads l
  JOIN companies c ON l.company_id = c.id
  WHERE l.campaign_cell_id = '<uuid>'
    AND l.email_verified IS NOT NULL
" --csv > leads_export.csv

# Upload via PlusVibe API of UI
```

### 5.3 Sequences configureren in PlusVibe

```
Sequence: SECX SaaS CX Sequence

Step 1 (Day 0):  [Subject from campaign_variants] + [Body template]
Step 2 (Day 3):  "Following up — {{company.name}} CX efficiency"
Step 3 (Day 8):  "Should I close the loop?"

Variables: {{first_name}}, {{company_name}}, {{title}}, {{personalization_hook}}
```

### 5.4 Sync met Business OS

```bash
# Edge function zorgt voor 2-richting sync
# campaigns table ↔ PlusVibe API

# Handmatig triggeren:
curl -X POST https://gjhbbyodrbuabfzafzry.supabase.co/functions/v1/sync-plusvibe-campaigns

# Of wacht op cron (elke 15 minuten)
```

---

## Stap 6: Monitoring & Optimalisatie

**Doel:** Campagne performance tracken en bijsturen.

### 6.1 Real-time tracking (Supabase)

```sql
-- Campaign performance view
SELECT
  c.name as campaign_name,
  cm.sent_count,
  cm.open_count,
  cm.reply_count,
  cm.bounce_count,
  ROUND(cm.reply_count::numeric / cm.sent_count * 100, 2) as reply_rate,
  c.health_status
FROM campaigns c
LEFT JOIN campaign_metrics cm ON c.id = cm.campaign_id
WHERE c.client_id = '<secx_uuid>';
```

### 6.2 Belangrijke metrics per fase

```
Fase        │ Metric              │ Target    │ Actie bij onderperforming
════════════╪═════════════════════╪═══════════╪═══════════════════════════════════════
Deliverability│ Bounce rate       │ < 3%      │ Pause, clean list, check verification
            │ Spam complaint rate │ < 0.1%    │ Pause, review copy
────────────┼─────────────────────┼───────────┼───────────────────────────────────────
Engagement  │ Open rate           │ > 45%     │ Test subject lines
            │ Reply rate          │ > 5%      │ Review offer/personalization
────────────┼─────────────────────┼───────────┼───────────────────────────────────────
Conversion  │ Positive reply rate │ > 15%     │ Bijsturen targeting
            │ Meeting booked rate │ > 3%      │ Scherper CTA
```

### 6.3 Alert triggers (Business OS)

```
Alert wordt getriggerd naar #vgg-alerts wanneer:
- Bounce rate > 5% in 24h
- Reply rate < 2% over 7 dagen
- Account disconnected (warmup drop)
- Daily send limit bereikt (opportunity om op te schalen)
```

### 6.4 Optimalisatie loop

```
Week 1:      Monitor deliverability (geen optimalisatie, alleen health check)
Week 2-3:    A/B test subject lines (open rate focus)
Week 4:      A/B test body copy (reply rate focus)
Week 5+:     Winning combo schalen, nieuwe cellen toevoegen
```

---

## Appendix A: Quick Reference Commands

### Daily operations

```bash
# Campaign status check
npx supabase sql -c "SELECT name, health_status, updated_at FROM campaigns WHERE client_id = '<uuid>';"

# Lead count per cell
npx supabase sql -c "SELECT cell_code, COUNT(*) FROM leads WHERE cell_id IS NOT NULL GROUP BY cell_code;"

# Sync forceren
npx supabase functions deploy sync-plusvibe-campaigns --no-verify-jwt
```

### Troubleshooting

```
Probleem                    │ Oplossing
════════════════════════════╪══════════════════════════════════════════════════════
Leads niet in PlusVibe      │ Check sync_log voor errors
Bounce rate te hoog         │ Pause campagne, check email_waterfall patterns
Geen replies                │ Review value prop in Template B — is deze persona-specifiek?
Account disconnected        │ Check email_inboxes.warmup_score, reconnect via PlusVibe
```

---

## Appendix B: Integration Points

```
SentioCX (Value Props)
  ↓
Template B v2 (Campaign Cell Brief)
  ↓
Supabase GTM Framework (cells, segments, personas)
  ↓
google-maps-scraper / A-Leads API (Lead sourcing)
  ↓
process-gmaps-batch / find-contacts / email-waterfall (Edge functions)
  ↓
leads table (verified, enriched)
  ↓
PlusVibe API (Campaign execution)
  ↓
webhook-receiver / lead-router (Real-time sync)
  ↓
Slack #vgg-alerts (Monitoring)
```

---

*Laatst bijgewerkt: 2026-03-29*
*Vragen? Check `outbound-playbook.md` voor strategische context of `CLAUDE.md` voor technische architectuur.*
