# Full Client Onboarding

Volledige onboarding flow: formulier → research → strategy → copy → review.

**Usage**: `/onboard CLIENT_CODE`

## Dit command voert de volledige onboarding pipeline uit:

### 1. Client opzoeken
- Query `clients` waar `client_code = '$ARGUMENTS'`
- Als niet gevonden: stop en meld fout

### 2. Onboarding formulier
- Check `onboarding_form` JSONB
- Als leeg: vraag Sjoerd om de volgende info:
  - Product/dienst beschrijving
  - Doelgroep
  - Waardepropositie
  - Bekende concurrenten
  - Pricing model
  - Tone of voice (formeel/casual)
  - Speciale instructies
- Sla op in `clients.onboarding_form`
- Update `clients.onboarding_status` → `'form_submitted'`

### 3. Deep Research
- Voer dezelfde stappen uit als `/research $ARGUMENTS`
- Gebruik onboarding formulier als startpunt voor de research
- Na afronding: toon samenvatting en vraag of Sjoerd wil aanvullen

### 4. GTM Strategy
- Voer dezelfde stappen uit als `/strategy $ARGUMENTS`
- Na afronding: toon offers en ICPs
- Vraag Sjoerd welke offers hij wil goedkeuren
- Wacht op approval voordat we doorgaan

### 5. Campaign Copy
- Voer dezelfde stappen uit als `/copy $ARGUMENTS`
- Alleen voor goedgekeurde offers
- Na afronding: toon alle email variants
- Vraag Sjoerd welke hij wil goedkeuren

### 6. Review samenvatting
- Toon volledige pipeline status (zoals `/review $ARGUMENTS`)
- Suggereer volgende stap (internal Slack review of direct deploy)

## Notities
- Elke stap wacht op Sjoerd's input/approval voordat de volgende start
- Als Sjoerd eerder wil stoppen, kan hij altijd later verder met de losse commands
- Alle data wordt opgeslagen in Supabase + research/CLIENT_CODE.md na elke stap
