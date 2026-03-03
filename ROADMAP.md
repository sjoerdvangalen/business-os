# Business OS — Roadmap

> Gebaseerd op: huidige systeem-analyse, outbound-playbook.md, Cold Email v2 Skill (GEX/Eric), Nick Abraham/Leadbird (OutboundContent.com), Fivos Aresti (GTM Scaling tweets), en de huidige klantensituatie.

---

## Huidige Staat (wat er NU werkt)

### Infrastructuur (volledig operationeel)
- PlusVibe syncs: campaigns, accounts, leads, warmup, sequences, domains (*/15 min + daily)
- Reply pipeline: webhook-receiver → reply-classifier → lead-router → PlusVibe + Slack
- Campaign monitoring: health checks */15 min, domain checks dagelijks
- RLS op alle 14 tabellen, API keys in Supabase secrets

### Meeting Lifecycle (volledig operationeel)
- Webhook-meeting: Cal.com, Calendly, GHL via token-based routing
- Meeting-review: Slack Block Kit review 30 min na meeting
- Slack interactions: Qualified (direct), Unqualified/No-Show (modals met bewijs), Rescheduled (modal met datum/tijd)
- Opportunity pipeline: meetings → opportunities (1:1 status sync)

### Onboarding Framework (commands klaar, nog niet getest met echte klant)
- `/onboard`, `/research`, `/strategy`, `/copy`, `/review` commands
- outbound-playbook.md als knowledge base
- Onboarding pipeline in DB: not_started → ... → deployed

### Wat NIET werkt / mist
- Cal.com/GHL webhook URLs niet geconfigureerd in de platforms
- SLACK_TEST_CHANNEL nog actief (moet per client)
- n8n nog als backup (niet uitgeschakeld)
- Geen reporting (daily digest, client reports)
- Geen lead list building automation
- research/ directory is leeg (geen klant-research bestanden)
- Geen multi-channel (alleen cold email, geen cold call/LinkedIn)

---

## Fase 1: Live Gaan (Week 1-2)

**Doel**: Het systeem live zetten voor GTM Scaling als eerste klant, zodat de volledige pipeline draait.

### 1A. Calendar Webhooks Configureren
**Impact**: HOOG — zonder dit werkt de meeting lifecycle niet
**Effort**: 15 min per klant

| Klant | Platform | Actie |
|-------|----------|-------|
| GTMS | Cal.com | Webhook URL + token instellen |
| BETS | Cal.com | Webhook URL + token instellen |
| DOMS | Cal.com | Webhook URL + token instellen |
| DIGT | GHL | Webhook URL + token instellen |
| PROL | GHL | Webhook URL + token instellen |
| NEBE | GHL | Webhook URL + token instellen |

Tokens staan klaar in `client_integrations`. URLs: `https://gjhbbyodrbuabfzafzry.supabase.co/functions/v1/webhook-meeting?token=<TOKEN>`

### 1B. Slack Channels Finaliseren
**Impact**: HOOG — zonder dit gaan review berichten naar verkeerde channel
**Effort**: 30 min

- [ ] `SLACK_TEST_CHANNEL` env var verwijderen
- [ ] Controleer dat `clients.slack_channel_id` correct is voor alle actieve klanten
- [ ] Test: meeting-review stuurt naar juiste client channel (niet test channel)
- [ ] #vgg-alerts channel ID bevestigen voor no-show/unqualified alerts

### 1C. GTM Scaling als Pilot
**Impact**: HOOG — eigen bedrijf = veilig om te testen
**Effort**: 2-3 uur

1. `/onboard GTMS` draaien — volledige pipeline doorlopen
2. Research file aanmaken: `research/GTMS.md`
3. Strategy genereren + goedkeuren
4. Copy genereren + goedkeuren
5. End-to-end test: campaign live → lead reply → classificatie → Slack
6. End-to-end test: meeting booked → review → klik → status update

### 1D. n8n Uitfaseren
**Impact**: MEDIUM — kost geld en creëert verwarring
**Effort**: 1 uur

- [ ] Vergelijk n8n workflow outputs met Supabase sync outputs (1 week data)
- [ ] Als consistent: n8n workflows deactiveren (niet verwijderen)
- [ ] Monitor 1 week, dan definitief uitschakelen
- [ ] Update CLAUDE.md

---

## Fase 2: Client Reporting (Week 2-3)

**Doel**: Automatische reports zodat klanten inzicht hebben zonder dat Sjoerd handmatig data trekt.

### 2A. Daily Digest → #vgg-alerts
**Impact**: HOOG — Sjoerd's eigen dashboard in Slack
**Effort**: Medium

Nieuwe edge function: `daily-digest`
Schedule: dagelijks om 07:00 CET via pg_cron

**Inhoud per klant:**
```
[CLIENT_CODE] — Gisteren:
- Verzonden: 342 | Replies: 12 (3.5%)
- Interested: 3 | Meetings: 1
- Health: HEALTHY | Actieve campaigns: 4
- Waarschuwingen: [bounce rate FRTC-campaign-3 > 3%]
```

**Data bronnen** (allemaal al in Supabase):
- `campaigns` — status, health_status
- `contacts` — reply counts per dag
- `meetings` — booked/qualified per dag
- `email_accounts` — bounce rates uit monitoring_notes

### 2B. Per-Client Weekly Report → Client Slack Channel
**Impact**: HOOG — klanten zien resultaten zonder te vragen
**Effort**: Medium

Nieuwe edge function: `client-report`
Schedule: maandag 09:00 CET (of configureerbaar via `clients.report_frequency`)

**Inhoud**:
```
Weekly Report: [CLIENT_NAME]
Period: 24 feb - 2 mar 2026

OUTREACH
- Emails sent: 2,145
- Reply rate: 3.2% (benchmark: 2-5%)
- Interested: 14 (0.65%)

MEETINGS
- Booked: 3
- Qualified: 2
- Unqualified: 1

PIPELINE
- Active opportunities: 5
- Total value: [als opportunity_val is ingesteld]

HEALTH
- All campaigns: HEALTHY
- Domain health: 98% pass rate
```

### 2C. KPI Tracking Table
**Impact**: MEDIUM — historische data voor trends
**Effort**: Klein

Nieuwe tabel: `daily_kpis`
```sql
CREATE TABLE daily_kpis (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID REFERENCES clients(id),
  date DATE NOT NULL,
  emails_sent INT DEFAULT 0,
  replies INT DEFAULT 0,
  interested INT DEFAULT 0,
  meetings_booked INT DEFAULT 0,
  meetings_qualified INT DEFAULT 0,
  bounce_rate DECIMAL(5,4),
  reply_rate DECIMAL(5,4),
  created_at TIMESTAMPTZ DEFAULT now()
);
```
Populatie: door `daily-digest` functie bij elke run.

---

## Fase 3: Onboarding Verbeteren (Week 3-4)

**Doel**: De onboarding pipeline verfijnen met inzichten uit Cold Email v2 en Nick Abraham.

### 3A. Research Command Upgraden
**Impact**: HOOG — betere research = betere campaigns
**Effort**: Medium

Verbeteringen op basis van het Cold Email v2 framework:

1. **Case Study Extraction** (Tier 1 research)
   - Automatisch case studies scrapen van client's website
   - Extractie: customer type, problem, metric, outcome, timeframe
   - Opslaan als gestructureerde data in `clients.research`

2. **TAM Mapping** toevoegen aan `/research`
   - Industry segmentatie met NAICS codes
   - Market size schatting per segment
   - Prioritering: Market Size x Solution Fit x Sales Cycle x Deal Value

3. **Competitor Landscape**
   - G2 reviews (als beschikbaar)
   - LinkedIn About Us van concurrenten
   - Pricing page analyse

### 3B. Strategy Command Upgraden
**Impact**: HOOG — betere ICPs = betere targeting
**Effort**: Medium

1. **Pain-Qualified Segments (PQS)** toevoegen
   - Groepeer prospects op gedeelde pijnpunten (niet alleen firmographics)
   - Per PQS: specifieke messaging angle

2. **Personal Win Mapping** (uit playbook)
   - Niet alleen business ROI maar ook persoonlijk voordeel per persona
   - VP: "Look smart to your board" vs Manager: "Do your job and leave on time"

3. **Objection Preemption Matrix**
   - Per ICP: top 3 objections + hoe we ze proactief adresseren in copy
   - Automatisch meenemen naar `/copy`

### 3C. Copy Command Upgraden — Cold Email v2 Integratie
**Impact**: ZEER HOOG — dit is de kern van het product
**Effort**: Groot

**De grootste upgrade in de hele roadmap.** De `/copy` command moet het volledige Cold Email v2 systeem implementeren:

1. **Campaign Type Selectie**
   - Automatisch bepalen welk type campaign past bij de beschikbare data:
     - Tier 1/2 signals → Custom Signal Campaign
     - Case studies beschikbaar → Creative Ideas Campaign
     - Beperkte data → Whole Offer Campaign
     - Onduidelijke buyer → Redirect/Fallback Campaign

2. **Variable Schema Toepassen**
   - Core variables: `{{first_name}}`, `{{company_name}}`, `{{role_title}}`
   - High-signal: `{{hiring_roles}}`, `{{recent_post_topic}}`, `{{competitor}}`
   - AI-generated: `{{ai_customer_type}}`, `{{ai_generation}}`
   - Custom per campaign: `{{g2_review}}`, `{{pricing_insight}}`

3. **Scoring Rubric (0-100)**
   - Na elke gegenereerde email: automatisch scoren
   - Situation Recognition (25), Value Clarity (25), Personalization (20), CTA (15), Punchiness (10), Subject (5)
   - < 70 = herschrijven, 70-84 = nog een pass, 85+ = ship it

4. **QA Checklist** automatisch doorlopen
   - Geen verboden zinnen ("I hope this finds you well", "I wanted to reach out")
   - Word count check (50-90)
   - CTA check (reply in 5 woorden)
   - 3-Pass Cutting Process: fluff → compress → adjectives

5. **Follow-up Sequence Structuur** (uit Cold Email v2)
   - Email 1 (Day 0): Full campaign + signal
   - Email 2 (Day 3): In-thread, andere value prop
   - Email 3 (Day 7): New thread, whole-offer of redirect
   - Email 4 (Day 11): Breakup met value-add

---

## Fase 4: Lead List Automation (Week 4-6)

**Doel**: Geautomatiseerd lead lists bouwen die voldoen aan de kwaliteitseisen uit Nick Abraham/Leadbird.

### 4A. Lead Validation Waterfall
**Impact**: HOOG — slechte lijsten = slechte deliverability
**Effort**: Groot

Nick Abraham's channel routing implementeren:
```
Raw Leads (van Clay/Apollo/etc.)
  → Email Validation (MillionVerifier API)
    → Valid → PlusVibe campaign
    → Catch-All → Scrubby validation
      → Valid → PlusVibe campaign (apart)
      → Invalid → Skip (of cold call lijst)
```

**Implementatie**:
- Nieuwe edge function: `validate-leads`
- MillionVerifier API integratie
- Scrubby API integratie voor catch-all
- Automatisch splitsen: valid vs catch-all campaigns in PlusVibe

### 4B. LinkedIn About Us Filtering
**Impact**: HOOG — 90-95% targeting accuracy vs 50-60%
**Effort**: Medium

Nick Abraham's methode:
1. LinkedIn company URLs enrichen → About Us tekst ophalen
2. Dream account keywords extracten
3. Keyword filter: `aboutus_text CONTAINS ("keyword1", "keyword2"...)`
4. Combineren met industry filter

**Implementatie opties**:
- Clay integration (preferred — zij doen de scraping)
- Apify actor voor LinkedIn scraping
- Opslaan in `contacts` of aparte `company_profiles` tabel

### 4C. Data Quality Checks
**Impact**: MEDIUM — voorkomt burned domains
**Effort**: Klein

Automatische checks voor elke lead list import:
- [ ] Formatting: geen "LLC"/"Inc." in company names
- [ ] ISP diversiteit: 2 Google : 1 Outlook ratio
- [ ] Mimecast/Proofpoint → bottom of CSV
- [ ] Employment check: current company vs. data
- [ ] Deduplicatie tegen bestaande contacts + blocklist

---

## Fase 5: Deliverability Intelligence (Week 5-7)

**Doel**: Pro-actief deliverability problemen detecteren en oplossen, op basis van Nick Abraham's methodiek.

### 5A. Domain Performance Tracking
**Impact**: HOOG — burned domains kosten meetings
**Effort**: Medium

Upgrade `domain-monitor`:
- Reply rate per domain berekenen (niet alleen DNS checks)
- Vergelijken met gemiddelde: als domain 33%+ onder average → alert
- Combinatie regel: < 1% reply rate AND > 3% bounce rate → auto-pause suggestie
- Trend tracking: reply rate over tijd per domain

### 5B. Infrastructure Rotation Alerts
**Impact**: MEDIUM — voorkomt domain burn
**Effort**: Klein

Alerts naar #vgg-alerts:
- Domain ouder dan 3 maanden actief → "Overweeg rotatie"
- Warmup score dalend → "Check deliverability"
- Meer dan 2 mailboxes per domain → "Over limit"
- Provider split afwijkend (niet 50/50 Google/Microsoft) → waarschuwing

### 5C. Volume Planning Calculator
**Impact**: MEDIUM — helpt bij capacity planning
**Effort**: Klein

Berekening in daily-digest of aparte functie:
```
Target meetings/maand → benodigde interested leads
→ benodigde replies → benodigde emails
→ benodigde mailboxes → benodigde domains
→ huidige capaciteit vs. benodigde capaciteit = GAP
```

Per klant: "Je hebt 12 mailboxes actief, dat is goed voor ~6,600 emails/maand. Bij 3% reply rate = ~198 replies. Bij 0.5% interested = ~33 interested. Target: 10 meetings → je zit goed."

---

## Fase 6: AI-Native Agency Model (Week 6-10)

**Doel**: Naar Fivos Aresti's model van een AI-native agency met 70-80% margins.

### 6A. Automated Campaign Optimization Agent
**Impact**: ZEER HOOG — dit is de echte leverage
**Effort**: Groot

Nieuwe edge function: `campaign-optimizer` (daily)

**Wat het doet**:
1. Analyseer reply rates per campaign (minimaal 1000 emails wachten)
2. Vergelijk varianten A/B binnen campaigns
3. Als variant A 2x+ beter presteert → suggestie: "Pause variant B, scale variant A"
4. Als reply rate < 1% na 1000 emails → suggestie: "Check deliverability of herzie copy"
5. Als interested rate < 0.3% → suggestie: "Offer/targeting issue — herzie ICP"

**Output**: Slack alert naar #vgg-alerts met actionable suggesties.
Sjoerd beslist (human-in-the-loop).

### 6B. Reply Quality Analysis
**Impact**: HOOG — begrijp waarom mensen reageren
**Effort**: Medium

Upgrade `reply-classifier`:
- Na classificatie: sentiment analysis op interested replies
- Welke zinnen/angles triggeren positieve reacties?
- Pattern detection: "Klanten die reageren op variant A noemen vaak X"
- Wekelijkse summary: "Top-performing angles deze week: [1, 2, 3]"

### 6C. Client Onboarding Automation
**Impact**: HOOG — schaalt het onboarding proces
**Effort**: Medium

Het hele onboarding pad automatiseren:
1. Client vult Google Form in → webhook → `clients.onboarding_form` vullen
2. `/research` draait automatisch (web search + form data)
3. Sjoerd reviewt research → approved
4. `/strategy` draait automatisch
5. Sjoerd reviewt strategy → approved offers
6. `/copy` draait automatisch
7. Sjoerd reviewt copy → approved variants
8. Campaign setup in PlusVibe via API
9. Calendar webhook automatisch aanmaken

**Target**: Van "nieuwe klant" naar "live campaigns" in < 48 uur (nu 1-2 weken).

---

## Fase 7: Multi-Channel Expansie (Week 8-12)

**Doel**: Naast cold email ook cold call en LinkedIn als channels toevoegen (Fivos model).

### 7A. Cold Call Integration
**Impact**: HOOG — highest conversion per touch
**Effort**: Groot

- Phone enrichment via LeadMagic API
- Catch-all rejects + no-email leads → cold call lijst
- Integratie met dialer (Salesfinity of vergelijkbaar)
- Call outcomes loggen in Supabase
- Meetings vanuit calls → zelfde pipeline

### 7B. LinkedIn Outreach
**Impact**: MEDIUM — goed voor ABM/enterprise
**Effort**: Medium

- HeyReach of vergelijkbare tool
- Leads zonder valid email + geen phone → LinkedIn
- Connection request + InMail sequences
- Sync outcomes terug naar Supabase

### 7C. Multi-Threading per Account
**Impact**: HOOG voor enterprise deals — LAAG voor SMB
**Effort**: Medium

Fivos's model: 3-5 stakeholders per account benaderen.
- VP: strategische angle
- Manager: tactische angle
- End user: daily pain angle
- Automatisch detecteren wie al benaderd is binnen zelfde company domain

---

## Prioriteiten Samenvatting

| # | Item | Impact | Effort | Week |
|---|------|--------|--------|------|
| 1 | Calendar webhooks configureren | HOOG | Klein | 1 |
| 2 | Slack channels finaliseren | HOOG | Klein | 1 |
| 3 | GTM Scaling pilot (onboarding) | HOOG | Medium | 1-2 |
| 4 | n8n uitfaseren | MEDIUM | Klein | 2 |
| 5 | Daily digest (#vgg-alerts) | HOOG | Medium | 2-3 |
| 6 | Per-client weekly report | HOOG | Medium | 2-3 |
| 7 | Copy command upgrade (Cold Email v2) | ZEER HOOG | Groot | 3-4 |
| 8 | Research command upgrade | HOOG | Medium | 3-4 |
| 9 | Lead validation waterfall | HOOG | Groot | 4-6 |
| 10 | Domain performance tracking | HOOG | Medium | 5-7 |
| 11 | Campaign optimization agent | ZEER HOOG | Groot | 6-10 |
| 12 | Client onboarding automation | HOOG | Medium | 6-10 |
| 13 | Multi-channel (cold call + LinkedIn) | HOOG | Groot | 8-12 |

---

## Hoogste Impact Items (Top 5)

### 1. Copy Command + Cold Email v2 (Fase 3C)
**Waarom**: Dit is letterlijk het product. Betere copy = meer replies = meer meetings = meer omzet. Het Cold Email v2 systeem met scoring rubric, variable schemas, en campaign type selectie maakt het verschil tussen "we sturen emails" en "we leveren een systeem dat consistent 3-5% reply rates haalt."

### 2. Campaign Optimization Agent (Fase 6A)
**Waarom**: Nu kijkt Sjoerd handmatig naar data. Een agent die dagelijks per campaign zegt "variant A werkt 2x beter, pause B" of "reply rate te laag, check deliverability" bespaart uren per week en verhoogt resultaat. Dit is het Fivos model: AI doet de analyse, mens beslist.

### 3. Lead Validation Waterfall (Fase 4A)
**Waarom**: Nick Abraham's data: slechte email validatie is de #1 oorzaak van domain burn. Een waterfall (MillionVerifier → Scrubby voor catch-all) voorkomt 80% van deliverability problemen voordat ze ontstaan.

### 4. Daily Digest + Client Reports (Fase 2A/2B)
**Waarom**: Klanten betalen retainer + meeting fees. Ze willen weten wat er gebeurt. Nu moet Sjoerd handmatig data trekken. Automatische reports = minder werk voor Sjoerd + hogere klant retentie.

### 5. GTM Scaling Pilot (Fase 1C)
**Waarom**: Niks van bovenstaande doet ertoe als het basissysteem niet live draait. Eerst eigen bedrijf als testcase, dan uitrollen naar klanten.

---

## Ideeën uit de Bronnen (nog niet ingepland)

### Van Nick Abraham (Leadbird)
- **Vendor redundancy**: Nooit 100% afhankelijk zijn van 1 tool. Altijd een backup voor PlusVibe hebben (Smartlead of Hypertide als fallback). Niet urgent nu, wel belangrijk bij schaal.
- **Saturday sending voor SMB**: Test weekend campagnes voor SMB klanten. Nick zegt dat zaterdag vaak beter converteert.
- **Employment check op schaal**: LinkedIn current company vs. data. Vermijd "die persoon werkt hier niet meer" replies.

### Van Fivos Aresti
- **Content als compounding channel**: Naast outbound ook content creëren (LinkedIn posts, newsletter) voor GTM Scaling. Outbound is lineair, content compound. Op langere termijn de mix verschuiven.
- **GTM Engineer als rol**: Sjoerd IS de GTM engineer. Positioneer jezelf zo: niet "we sturen emails" maar "we bouwen je outbound engine". Hogere waarde, hogere prijzen ($8-15K/maand i.p.v. $3-5K).
- **AI-native agency metrics**: Target 70-80% margin door AI agents voor research, copy, monitoring, reporting. De manual stappen zijn: strategy approval, copy approval, campaign troubleshooting.

### Van Cold Email v2 (GEX)
- **Lead Magnet Campaigns**: Resource-first approach. "Ik maakte een {{resource}} voor je en vroeg me af of het nuttig is." Werkt goed als trust-builder voor enterprise.
- **The "Specifically" Line**: 3x conversion booster. "Specifically, it looks like you're trying to sell to {{customer_type}}." Toevoegen als standaard element in `/copy`.
- **Value-Add Breakup**: In de laatste email prospects matchen met THEIR ICP als cadeau. Creatief, onderscheidend, hoge reply rate op breakups.

---

## Volgende Stap

Start met **Fase 1**: calendar webhooks configureren + Slack channels finaliseren + GTM Scaling pilot.

Dit zijn handmatige stappen die Sjoerd moet doen (tokens + URLs instellen in de platforms). Daarna kan ik de daily-digest en client-report edge functions bouwen (Fase 2).
