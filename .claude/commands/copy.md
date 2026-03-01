# Cold Email Copy Generator

Genereer cold email copy op basis van goedgekeurde offers en ICPs.

**Usage**: `/copy CLIENT_CODE`

## Stappen

### 1. Voorwaarden checken
- **ALTIJD EERST** lees `~/business-os/knowledge/outbound-playbook.md` — alle copy moet voldoen aan het framework hierin
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
- Structuur: Situation Recognition → Value Prop + Proof → CTA (uit playbook)
- Geen claims zonder bewijs
- Specifiek, niet vaag
- **Target: 50-90 woorden** (strict). Max 120 woorden alleen voor complexe offers.
- Doorloop de 3-pass cutting process uit de playbook: fluff (20%) → compress (15%) → adjectives (10%)

**CTA:**
- Altijd een soft ask — NOOIT "book a call" of "schedule a meeting"
- Gebruik CTA categories uit de playbook:
  - **Confirmation**: "Worth exploring?", "Is this still the case?"
  - **Value-Exchange**: "...to share what's working in {{industry}}"
  - **Resource Offer**: "Could I send you access?", "Want the 1-pager?"
  - **Soft Ask**: "Worth a 2-minute look if I send it?"
- **Test**: Kan de prospect antwoorden in 5 woorden of minder? Zo niet, simplify.

**P.S. line (optioneel):**
- Extra proof point of urgency
- Of een persoonlijke touch
- Of een company analogy ("A good way to think about us...")

### 4. Follow-up Sequences (per variant)

Volg de sequence filosofie uit de playbook: email → follow-up in thread → net new email → follow-up in thread.
Draai value props: save time → save money → make money.

**Follow-up 1 (3 dagen later) — In-thread:**
- Kort (2-3 zinnen), **geen nieuwe subject line** (threads in sequencer)
- **Andere value proposition** dan email 1 (ze reageerden niet = die angle resoneerde niet)
- Creative ideas variant werkt hier goed (3 bullet ideas)
- Geen "just following up" of "checking in"
- Lagere frictie CTA

**Follow-up 2 (7 dagen later) — Nieuwe thread:**
- **Nieuwe subject line** (verse inbox impressie)
- Social proof of case study
- Overweeg: drop alle AI personalisatie, ga voor whole-offer approach
- "Bedrijf X had hetzelfde probleem en bereikte [resultaat]"
- Of refereer naar collega's: "Let me know if {{employee_1}} or {{employee_2}} would be better"

**Follow-up 3 / Breakup (11 dagen later) — In-thread:**
- Laatste email, kort en vriendelijk
- Redirect naar andere persoon OF bied resources
- "Niet het juiste moment? Geen probleem."
- Creative optie: pull prospects matching THEIR ICP als value-add
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
