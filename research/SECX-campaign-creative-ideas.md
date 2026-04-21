# SentioCX — Creative Ideas Campaign

> Template naam: Creative Ideas Campaign
> Doel: Cold email outreach naar Salesforce Service Cloud gebruikers
> Hoek: 3 gepersonaliseerde verbeterpunten (bullets) per prospect
> Stijl: Soft, observational, laagdrempelig — geen hard sell

---

## Email Template

```
Hi {{first_name}},

Saw {{company}} is using Salesforce Service Cloud. Had 3 ideas where SentioCX could likely help:

{{bullet_1}}
{{bullet_2}}
{{bullet_3}}

Any of these worth exploring?
```

---

## Waarom dit werkt

**1. Observatie opent (niet een pitch)**
"Saw {{company}} is using Salesforce Service Cloud" — dit is een datapunt, geen claim. Het toont research en relevantie zonder arrogant over te komen.

**2. "Had 3 ideas" frame**
Dit frameert de bullets als losse ideeen, niet als een verkoper die een product duwt. Het geeft de prospect keuzevrijheid.

**3. De bullets zijn het werkpaard**
Elke bullet is een zelfstandig verbeterpunt. Samen vertellen ze een verhaal:
- Bullet 1: Het verbindingprobleem (routing zonder frictie)
- Bullet 2: Het mechanisme (intent-based matching)
- Bullet 3: Het resultaat (schaal zonder headcount)

**4. CTA is laagdrempelig**
"Any of these worth exploring?" vraagt geen meeting. Het nodigt uit tot een reactie op het niveau dat de prospect comfortabel vindt.

---

## Bulletstructuur per persona

De bullets worden dynamisch gegenereerd op basis van:
- **Bedrijfsnaam** (company)
- **Industrie** (6 verticals: SaaS, Financial, Healthcare, Staffing, Manufacturing, Engineering)
- **Schaal** (employee count gemapped naar 200+, 500+, 1.000+, 5.000+)
- **Persona** (4 typen: CX, OPS, TECH, CSUITE)

### CX Leadership
- B1: Connect [audience] to [experts] across [scale] without [friction]
- B2: Route [inquiries] via patented intent-based matching based on [A] and [B]
- B3: Handle/Scale/Cut [metric] across your [scale] workforce without [constraint] by leveraging [mechanism]

### Contact Center OPS
- B1: Send [items] directly to [specialists+scale] on first contact
- B2: Route [items] via intent-level pairing based on [A] and [B]
- B3: Improve first-contact resolution by 60%+ across your [scale] workforce without [constraint] while maintaining [continuity]

### Digital/Tech
- B1: Automate routing from [system] to [counterparts] via API-first intent routing
- B2: Deploy [capability] with your existing stack without [constraint]
- B3: Integrate with your existing stack via [method] without [risk]

### C-Suite
- B1: Reduce [overhead] across your entire [scale] workforce without [exposure]
- B2: Scale [capacity] across your [scope] without adding any headcount
- B3: Deliver [outcome] at a [metric] without [compromise]

---

## Impliciet contrast met Salesforce Service Cloud

De bullets dissen Salesforce nooit expliciet. Maar elke bullet contrasteert stilzwijgend met wat Service Cloud typisch doet:

| Bullet | Impliciete boodschap over hun huidige setup |
|--------|---------------------------------------------|
| "Connect X to specialists across scale without manual handoffs" | Service Cloud routing heeft nog handmatige stappen |
| "Route via patented intent-based matching based on A and B" | Huidige routing is queue-based, niet intent-based |
| "Handle volume without expanding team by leveraging mechanism" | Schaal vraagt nu extra headcount |

Dit is bewust. We triggeren geen verdedigingsreactie, maar planten wel het idee dat er een betere manier is.

---

## Voorbeeld (Hays, Staffing, CX)

```
Hi Sarah,

Saw Hays is using Salesforce Service Cloud. Had 3 ideas where SentioCX could likely help:

Connect candidates to experienced specialist recruiters across 5,000+ employees without manual routing.

Route candidate inquiries via patented intent-based matching based on role type and seniority tier.

Handle inquiry volume across your 5,000+ workforce without adding headcount by leveraging automated pairing.

Any of these worth exploring?
```

---

## Variabelenlijst

| Variabele | Bron | Voorbeeld |
|-----------|------|-----------|
| `{{first_name}}` | CSV / contact database | Sarah |
| `{{company}}` | CSV / company research | Hays |
| `{{bullet_1}}` | GPT-5.4-nano, persona-specifiek prompt | Connect candidates to... |
| `{{bullet_2}}` | GPT-5.4-nano, persona-specifiek prompt | Route candidate inquiries... |
| `{{bullet_3}}` | GPT-5.4-nano, persona-specifiek prompt | Handle inquiry volume... |

---

## Technische implementatie

- **Model**: GPT-5.4-nano (goedkoop, snel, cached prompts)
- **Output**: JSON `{ "bullets": ["...", "...", "..."] }`
- **Kosten**: ~$0.00034 per record
- **Scoring**: Automatische 10-puntsschaal (word count, structuur, hallucinatie check)
- **Resultaat**: 99.88% perfecte 10/10 scores (5.722/5.729)

---

## Status

- Prompts: v3 (getuned op basis van 5.729 record batch)
- Scorer: v3 (false positives gefixt)
- Output: `scripts/output/secx-messaging-csv-2026-04-20.jsonl` + `.csv`
- Klaar voor import naar EmailBison / campaign cells

---

*Laatst bijgewerkt: 2026-04-21*
