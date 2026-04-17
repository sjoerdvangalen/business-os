# Unified Data Model Proposal

> ⚠️ **DEPRECATED — HISTORICAL REFERENCE ONLY. DO NOT USE FOR IMPLEMENTATION.**
>
> Dit document beschrijft een voorstel uit 2025 dat is vervangen door het huidige model:
> `companies` + `contacts` (reusable pool) + `leads` (junction table) + `gtm_strategies` + `campaign_cells`.
> **Authoritative bronnen: `CLAUDE.md` en `ROADMAP.md`.**

---

## Huidige Probleem

Nu hebben we verspreide data:
- `leads` (27k rows) - van PlusVibe, alleen getargete contacts
- `companies` (17k rows) - bedrijven van leads
- `contacts` (0 rows) - scaffolding, niet gebruikt
- Geen centrale plek voor ALLE contacts en businesses

## Voorgesteld Model: Unified Contact & Business Hub

### Core Principes

1. **Eén bron van waarheid** voor contacts en businesses
2. **Reusability** - contact kan in meerdere campaigns gebruikt worden
3. **Duidelijke relatie mapping** - intern vs klant data
4. **Historie tracking** - wanneer is contact eerder getarget?

### Schema Ontwerp

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           UNIFIED MODEL                                  │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  ┌──────────────┐      ┌──────────────┐      ┌──────────────────┐       │
│  │  businesses  │◄─────│   contacts   │─────►│  contact_history │       │
│  │  (mega hub)  │      │  (mega hub)  │      │ (target tracking)│       │
│  └──────┬───────┘      └──────┬───────┘      └──────────────────┘       │
│         │                     │                                          │
│         │              ┌──────┴──────┐                                   │
│         │              │             │                                   │
│         │         ┌────┴────┐   ┌────┴────┐                              │
│         │         │internal │   │  client │                              │
│         │         │   rel   │   │   rel   │                              │
│         │         └────┬────┘   └────┬────┘                              │
│         │              │             │                                   │
│    ┌────┴────┐    ┌────┴────┐   ┌────┴────┐   ┌──────────┐             │
│    │opportun.│    │meetings │   │meetings │   │campaigns │             │
│    │ (intern)│    │(internal│   │(client) │   │  (plusv) │             │
│    └─────────┘    └─────────┘   └─────────┘   └──────────┘             │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

### Tabellen

#### 1. `businesses` (vervangt companies + accounts)

Eén mega tabel voor ALLE bedrijven:
- Die we willen targeten (prospects)
- Die we al targeten (active clients van onze klanten)
- Die we nooit targeten maar willen tracken

```sql
CREATE TABLE businesses (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Identificatie
  name                TEXT NOT NULL,
  domain              TEXT,                    -- hoofd domain
  website             TEXT,
  linkedin_url        TEXT,

  -- Locatie
  city                TEXT,
  state               TEXT,
  country             TEXT,

  -- Bedrijfsinfo
  industry            TEXT,
  sub_industry        TEXT,
  employee_count      INT,
  employee_range      TEXT,                    -- "11-50", "51-200", etc
  annual_revenue      TEXT,                    -- "$1M-$10M"

  -- Status
  business_type       TEXT NOT NULL DEFAULT 'prospect'
                        CHECK (business_type IN ('prospect', 'client', 'partner', 'competitor', 'do_not_target')),

  -- Source tracking
  source              TEXT NOT NULL DEFAULT 'manual'
                        CHECK (source IN ('gmaps_scraper', 'apollo', 'manual', 'import', 'referral')),
  source_id           TEXT,                    -- originele ID van source

  -- Hergebruik tracking
  first_seen_at       TIMESTAMPTZ DEFAULT now(),
  last_enriched_at    TIMESTAMPTZ,
  times_targeted      INT DEFAULT 0,           -- hoe vaak in campaigns gebruikt

  -- JSONB voor flexibele data
  enrichment_data     JSONB DEFAULT '{}',      -- clearbit, apollo, etc
  tags                TEXT[],

  -- Timestamps
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Unieke constraints
CREATE UNIQUE INDEX idx_businesses_domain ON businesses(domain) WHERE domain IS NOT NULL;
CREATE UNIQUE INDEX idx_businesses_linkedin ON businesses(linkedin_url) WHERE linkedin_url IS NOT NULL;
```

#### 2. `contacts` (unified - vervangt leads)

Eén mega tabel voor ALLE contacten:
- Nog nooit getarget
- Al wel getarget (herbruikbaar na cooldown)
- Actief in lopende campaigns

```sql
CREATE TABLE contacts (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id           UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,

  -- Persoonlijke info
  first_name            TEXT,
  last_name             TEXT,
  full_name             TEXT GENERATED ALWAYS AS (COALESCE(first_name, '') || ' ' || COALESCE(last_name, '')) STORED,

  -- Contactgegevens
  email                 TEXT,
  email_verified        BOOLEAN DEFAULT FALSE,
  email_verified_at     TIMESTAMPTZ,
  phone                 TEXT,

  -- Professional
  title                 TEXT,                  -- functie titel
  position              TEXT,                  -- seniority level
  department            TEXT,
  linkedin_url          TEXT,

  -- Status lifecycle
  contact_status        TEXT NOT NULL DEFAULT 'new'
                          CHECK (contact_status IN (
                            'new',                    -- nog nooit gebruikt
                            'targeted',               -- in active campaign
                            'responded',              -- heeft gereageerd
                            'meeting_booked',         -- meeting geboekt
                            'qualified',              -- goedgekeurd meeting
                            'not_interested',         -- expliciet nee
                            'unsubscribed',           -- afgemeld
                            'bounced',                -- email bounced
                            'do_not_contact'          -- blacklist
                          )),

  -- Targeting geschiedenis (HERGEBRUIK!)
  first_targeted_at     TIMESTAMPTZ,            -- eerste keer gebruikt
  last_targeted_at      TIMESTAMPTZ,            -- laatste keer gebruikt
  times_targeted        INT DEFAULT 0,          -- hoe vaak gebruikt
  last_campaign_id      UUID REFERENCES campaigns(id),

  -- Response tracking
  first_reply_at        TIMESTAMPTZ,
  last_reply_at         TIMESTAMPTZ,
  reply_count           INT DEFAULT 0,

  -- Meeting tracking
  meetings_booked_count INT DEFAULT 0,
  meetings_held_count   INT DEFAULT 0,

  -- Source tracking
  source                TEXT NOT NULL DEFAULT 'manual',
  source_id             TEXT,                   -- originele ID (plusvibe_lead_id, etc)

  -- Enrichment
  enrichment_data       JSONB DEFAULT '{}',     -- AI enrichment, Apollo data

  -- Cooldown / Hergebruik
  available_for_reuse_after TIMESTAMPTZ,        -- wanneer mag opnieuw gebruikt
  reuse_cooldown_days   INT DEFAULT 90,         -- standaard 90 dagen

  -- Timestamps
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexen voor performance
CREATE INDEX idx_contacts_business ON contacts(business_id);
CREATE INDEX idx_contacts_email ON contacts(email) WHERE email IS NOT NULL;
CREATE INDEX idx_contacts_status ON contacts(contact_status);
CREATE INDEX idx_contacts_available ON contacts(available_for_reuse_after)
  WHERE available_for_reuse_after IS NOT NULL;
CREATE INDEX idx_contacts_source_id ON contacts(source_id) WHERE source_id IS NOT NULL;
```

#### 3. `contact_campaigns` (linking table)

Koppelt contact aan specifieke campaign (many-to-many):

```sql
CREATE TABLE contact_campaigns (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id      UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  campaign_id     UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  client_id       UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,

  -- Campaign specifieke status
  campaign_status TEXT NOT NULL DEFAULT 'added'
                      CHECK (campaign_status IN ('added', 'sent', 'replied', 'meeting_booked', 'completed')),

  -- PlusVibe specifiek
  plusvibe_lead_id TEXT,

  -- Timestamps
  added_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  first_sent_at   TIMESTAMPTZ,
  first_reply_at  TIMESTAMPTZ,

  UNIQUE(contact_id, campaign_id)
);
```

#### 4. `meetings` (uitgebreid)

Meetings kunnen voor intern of klant zijn:

```sql
-- Bestaat al, maar toevoegen aan model uitleg
-- meetings.client_id -> voor klant meetings
-- meetings.contact_id -> altijd gekoppeld aan contacts
-- meetings.opportunity_id -> alleen voor intern (NULL voor klant meetings)
```

#### 5. `opportunities` (alleen voor intern)

```sql
-- Bestaat al
-- opportunities zijn ALLEEN voor VGG intern (sales pipeline)
-- Klanten zien NOOIT opportunities
-- Een opportunity ontstaat uit een meeting met een contact
```

### Data Flow

#### 1. Nieuwe Contact van GMaps Scraper

```
gmaps_scraper result
  → process-gmaps-batch
    → UPSERT business (op domain of linkedin_url)
    → UPSERT contact (op email of linkedin_url)
    → contact.business_id = business.id
    → contact.source = 'gmaps_scraper'
    → contact.contact_status = 'new'
```

#### 2. Contact naar Campaign

```
Campaign setup
  → find-contacts (A-Leads)
    → email-waterfall (verify)
    → ai-enrich-contact
      → contact.times_targeted += 1
      → contact.last_targeted_at = now()
      → contact.contact_status = 'targeted'
      → contact_campaigns INSERT
      → PlusVibe API (send leads)
```

#### 3. Contact Response

```
PlusVibe webhook (reply)
  → webhook-receiver
    → email_threads INSERT
    → contact.reply_count += 1
    → contact.last_reply_at = now()
    → contact.contact_status = 'responded'
    → contact_campaigns.campaign_status = 'replied'
```

#### 4. Meeting Booked

```
Cal.com webhook
  → webhook-meeting
    → meetings INSERT
    → contact.meetings_booked_count += 1
    → contact.contact_status = 'meeting_booked'

    IF interne klant:
      → opportunities INSERT
    ELSE (externe klant):
      → geen opportunity (client heeft geen sales pipeline)
```

### Relatie Matrix

| Entity | Internal | Client | Opmerking |
|--------|----------|--------|-----------|
| **contacts** | ✓ | ✓ | Unified, herbruikbaar |
| **businesses** | ✓ | ✓ | Unified |
| **campaigns** | ✓ | ✓ | Per client, synced van PlusVibe |
| **meetings** | ✓ | ✓ | Kan voor beide |
| **opportunities** | ✓ | ✗ | Alleen interne sales pipeline |
| **email_threads** | ✓ | ✓ | Alle email communicatie |

### Status Lifecycle

```
Contact Status Flow:

new
  └─► targeted (toegevoegd aan campaign)
        ├─► responded (reply ontvangen)
        │     ├─► meeting_booked
        │     │       ├─► qualified  → [herbruikbaar na 90d]
        │     │       ├─► no_show    → [herbruikbaar na 30d]
        │     │       └─► unqualified → [herbruikbaar na 90d]
        │     ├─► not_interested    → [herbruikbaar na 180d]
        │     └─► do_not_contact    → [nooit herbruiken]
        ├─► bounced                → [nooit herbruiken]
        └─► unsubscribed           → [nooit herbruiken]
```

### Hergebruik Logica

```sql
-- Contacts beschikbaar voor nieuwe campaign
SELECT * FROM contacts
WHERE contact_status IN ('new', 'qualified', 'no_show', 'unqualified', 'not_interested')
  AND (
    available_for_reuse_after IS NULL
    OR available_for_reuse_after <= now()
  )
  AND times_targeted < 3;  -- max 3x targeten
```

### Voordelen

1. **Eén bron van waarheid** - geen dubbele contacts meer
2. **Hergebruik** - contact kan na cooldown opnieuw gebruikt worden
3. **Historie** - volledige timeline van elk contact
4. **Flexibiliteit** - JSONB voor enrichment data
5. **Performance** - goede indexen, duidelijke relaties

### Migratie Pad

1. **Huidige data migreren:**
   - `companies` → `businesses`
   - `leads` → `contacts` (met business_id link)

2. **Sync functions updaten:**
   - `sync-plusvibe-leads` → schrijf naar `contacts` + `contact_campaigns`
   - `process-gmaps-batch` → schrijf naar `businesses` + `contacts`

3. **Deprecated:**
   - `companies` table (na migratie)
   - `leads` table (na migratie, hernoemd naar contacts)

Wil je dat ik deze migratie uitwerk en uitvoer?
