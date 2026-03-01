# Cold Email Copy Generator

Genereer cold email copy op basis van goedgekeurde offers en ICPs.

**Usage**: `/copy CLIENT_CODE`

## Stappen

### 1. Voorwaarden checken
- Query `clients` waar `client_code = '$ARGUMENTS'`
- Check dat `strategy` JSONB niet leeg is — zo wel: "Run eerst `/strategy $ARGUMENTS`"
- Lees `clients.strategy` (offers + ICPs) en `clients.research` voor context
- Check welke offers status "approved" hebben (of als er geen approved zijn, gebruik alle offers)

### 2. Per Offer: 2 Email Variants genereren

**Variant A — Pain-Led:**
Focus op het probleem. Open met een observatie over hun situatie.

**Variant B — Social Proof / Value-Led:**
Focus op resultaat. Open met wat vergelijkbare bedrijven bereikt hebben.

### 3. Email Structuur (per variant)

**Subject line:**
- Max 50 karakters
- Pattern-interrupt of curiosity-driven
- Geen clickbait, geen ALL CAPS
- Gebruik {{company}} of {{first_name}} als het natuurlijk past
- Voorbeelden: "{{company}}'s [specifiek probleem]", "Vraag over [hun industrie]"

**Preview text:**
- 1 zin die de subject line aanvult (wordt getoond in inbox preview)

**Hook (opening):**
- Eerste zin die direct relevant is voor de prospect
- Refereer aan iets specifieks: hun bedrijf, hun rol, hun industrie
- NOOIT beginnen met "I" of "My name is" of "Hope this finds you well"
- Gebruik {{first_name}}, {{company}}, {{industry}} variables

**Body:**
- Max 3-5 zinnen na de hook
- Structuur: Pain → Agitate → Solution (kort!)
- Geen claims zonder bewijs
- Specifiek, niet vaag
- Totaal max 120 woorden (inclusief hook + CTA)

**CTA:**
- Altijd een soft ask — NOOIT "book a call" of "schedule a meeting"
- Goede CTAs: "Worth exploring?", "Open to learning more?", "Makes sense to chat?", "Relevant for you?"
- Kies CTA type gebaseerd op offer: Direct / Interest / Value / Cliffhanger

**P.S. line (optioneel):**
- Extra proof point of urgency
- Of een persoonlijke touch

### 4. Follow-up Sequences (per variant)

**Follow-up 1 (3 dagen later):**
- Kort (2-3 zinnen)
- Refereer aan vorige email
- Voeg nieuw angle toe (ander pain point of ander voordeel)
- Geen "just following up" of "checking in"

**Follow-up 2 (5 dagen later):**
- Social proof of case study
- "Bedrijf X had hetzelfde probleem en bereikte [resultaat]"
- Kort en specifiek

**Follow-up 3 / Breakup (7 dagen later):**
- Laatste email
- Kort, vriendelijk, geeft ze een out
- "Niet het juiste moment? Geen probleem. [Waarde-toevoeging]"
- Laat de deur open

### 5. Formatting Rules
- Alle emails in plain text (geen HTML formatting)
- Korte paragrafen (max 2 zinnen per paragraaf)
- Mobile-friendly (test op smal scherm)
- Variables: `{{first_name}}`, `{{company}}`, `{{industry}}`, `{{pain_point}}`, `{{competitor}}`
- Taal: match de `clients.language` waarde (en = Engels, nl = Nederlands, de = Duits)

### 6. Opslaan in Sequences tabel
Per email variant, maak rows in `sequences`:

```
campaign_id: [wordt later gekoppeld of maak nieuw campaign aan]
step_number: 1 (initial), 2 (follow-up 1), 3 (follow-up 2), 4 (breakup)
name: "Offer A - Variant 1 - Initial"
subject: [subject line]
body: [volledige email tekst met {{variables}}]
variation: "pain_led" of "social_proof"
wait_time_days: 0 (initial), 3, 5, 7
offer_variant: [offer naam]
target_icp: [ICP naam]
tone: [casual/professional/provocative]
copy_status: "draft"
```

### 7. Status updaten
- Update `clients.onboarding_status` → `'copy_done'`
- Log naar `agent_memory`

### 8. Research .md updaten
- Append copy sectie aan `~/business-os/research/$ARGUMENTS.md`

### 9. Presenteren
- Toon alle variants overzichtelijk
- Per variant: subject line + eerste 2 zinnen (preview)
- Vraag Sjoerd welke hij wil goedkeuren
- Suggereer volgende stap: internal review of `/review $ARGUMENTS`
