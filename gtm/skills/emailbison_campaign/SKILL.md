# Email Bison Campaign Skill

Standaardiseerde Email Bison campaign creatie met warmed inbox attachment voor business-os.

## Doel

Deze skill zorgt voor consistente campaign configuratie volgens business-os standaarden:
- Disabled open tracking (betere deliverability)
- Plain text emails (geen HTML/links/images)
- Geen unsubscribe link (gebruik opt-out tekst)
- Follow-ups geprioriteerd boven nieuwe leads
- Business hours (08:00-17:00, Mon-Fri, Europe/Amsterdam)

## Gebruik

### CLI (Terminal)

```bash
# Preview campaign
cd ~/ai-projects/business-os
python -m gtm.skills.emailbison_campaign.cli preview \
  --client FRTC \
  --name "FRTC | EN | SaaS Origination Q2"

# Create campaign (review mode - alleen preview)
python -m gtm.skills.emailbison_campaign.cli create \
  --client FRTC \
  --name "FRTC | EN | SaaS Origination Q2"

# Create campaign (immediate - direct aanmaken)
python -m gtm.skills.emailbison_campaign.cli create \
  --client FRTC \
  --name "FRTC | EN | SaaS Origination Q2" \
  --mode immediate

# List available sequences
python -m gtm.skills.emailbison_campaign.cli sequences

# List patterns (aanhef/afsluiting/variables)
python -m gtm.skills.emailbison_campaign.cli patterns
```

### Python API

```python
from gtm.skills.emailbison_campaign import (
    CampaignManager,
    CampaignCreateRequest,
    AccountAttachmentConfig,
)

# Initialize
manager = CampaignManager()

# Create request
config = AccountAttachmentConfig(mode="review")  # of "immediate"
request = CampaignCreateRequest(
    client_code="FRTC",
    campaign_name="FRTC | EN | SaaS Origination Q2",
    template="business_os_default",
    account_config=config,
)

# Preview
preview = manager.preview_campaign(request)
print(f"Inboxes found: {len(preview.inboxes)}")

# Create
result = manager.create_campaign(request)
print(f"Campaign ID: {result.get('emailbison_campaign_id')}")
```

### Supabase Edge Function

```bash
# Preview (review mode)
curl -X POST "https://gjhbbyodrbuabfzafzry.supabase.co/functions/v1/emailbison-campaign-create" \
  -H "Authorization: Bearer ${SUPABASE_ANON_KEY}" \
  -H "Content-Type: application/json" \
  -d '{
    "client_code": "FRTC",
    "campaign_name": "FRTC | EN | Test",
    "mode": "review"
  }'

# Create (immediate)
curl -X POST "https://gjhbbyodrbuabfzafzry.supabase.co/functions/v1/emailbison-campaign-create" \
  -H "Authorization: Bearer ${SUPABASE_ANON_KEY}" \
  -H "Content-Type: application/json" \
  -d '{
    "client_code": "FRTC",
    "campaign_name": "FRTC | EN | Test",
    "mode": "immediate"
  }'
```

## Configuratie

### Environment Variables

```bash
EMAIL_BISON_API_KEY=your_api_key_here
SUPABASE_URL=https://gjhbbyodrbuabfzafzry.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your_key_here
```

### Templates

**business_os_default** (enige template):
- Max emails/day: 10,000 (Email Bison default)
- Max new sequences/day: 10,000
- Schedule: 08:00-17:00, Mon-Fri, Europe/Amsterdam
- Prioritize followups: ja
- Track opens: nee
- Plain text: ja
- Unsubscribe link: nee

## Email Bison Spintax Syntax

Email Bison gebruikt **Spintax** voor variatie en **Liquid-style variabelen** voor personalisatie.

**→ Uitgebreide documentatie: [SPINTAX.md](./SPINTAX.md)**

### Spintax Formaat

Gebruik `{optie1|optie2|optie3}` voor willekeurige rotatie per email:

```
{Hi|Hallo|Goedendag} {FIRST_NAME},
```

Resultaat: Elk bericht krijgt willekeurig "Hi John," of "Hello John," of "Hey John,"

### Variabelen (UPPERCASE)

| Variabele | Voorbeeld | Beschrijving |
|-----------|-----------|--------------|
| `{FIRST_NAME}` | John, Sjoerd | Contact voornaam |
| `{COMPANY_NAME}` | Acme Corp | Bedrijfsnaam prospect |
| `{SENDER_FULL_NAME}` | Jan Jansen | Volledige naam afzender |
| `{ICP}` | SaaS, Consulting | Industrie segment |

### Nested Spintax

Variabelen kunnen binnen spintax:

```
{Goedendag {FIRST_NAME}|Hi {FIRST_NAME}}
```

### Officiele Patronen (uit PlusVibe sequences)

**Nederlandse aanhef:**
```
{Hi|Hallo|Goedendag|Dag|Hoi} {FIRST_NAME},
```

**Nederlandse afsluiting:**
```
{Met vriendelijke groet|Vriendelijke groet|Met hartelijke groet|Hartelijke groet|Groet|Groeten},
{SENDER_FULL_NAME}
```

**Engelse afsluiting:**
```
{Best regards|Kind regards|Warm regards|Sincerely|All the best|Best|Cheers|Regards},
{SENDER_FULL_NAME}
```

### CLI: Bekijk Alle Patronen

```bash
./scripts/emailbison-campaign patterns
```

### Documentatie
- Email Bison Spintax: https://help.emailbison.com/en/articles/spintax
- Liquid Templates: https://shopify.github.io/liquid/
- **Uitgebreide patronen: [SPINTAX.md](./SPINTAX.md)**

## Inbox Attachment

De skill koppelt automatisch gewarmde inboxes aan de campaign via het Email Bison API endpoint `POST /api/campaigns/{id}/attach-sender-emails`.

### Wat de skill doet:

1. Zoekt automatisch `email_inboxes` met:
   - `provider_inbox_id IS NOT NULL` (gekoppeld aan Email Bison)
   - `client_id = <client>`
   - `warmup_score >= 80` OF `warmup_status = 'completed'`

2. Koppelt alle gevonden inboxes in één API call aan de campaign

3. Retourneert het aantal succesvol gekoppelde accounts

### Workflow:

```bash
# 1. Preview (check welche inboxes gevonden worden)
python -m gtm.skills.emailbison_campaign.cli preview --client GTMS --name "Test"

# 2. Create (maakt campaign aan en koppelt automatisch inboxes)
python -m gtm.skills.emailbison_campaign.cli create --client GTMS --name "Test" --mode immediate
# Output: "Attached accounts: 42"
```

## File Structuur

```
gtm/skills/emailbison_campaign/
├── __init__.py              # Package exports
├── SKILL.md                 # Deze documentatie
├── SPINTAX.md               # Spintax syntax & pattern library docs
├── config.py                # Data classes (settings, requests, previews)
├── templates.py             # Campaign settings templates (NOT sequences)
├── patterns.py              # Pattern library (aanhef/afsluiting/variables)
├── emailbison_campaign.py   # Core CampaignManager class
└── cli.py                   # CLI interface
```

## Integratie met Orchestrator

Voor automatische campaign creatie vanuit campaign cells:

```python
# In gtm/orchestrator.py
from gtm.skills.emailbison_campaign import (
    CampaignManager,
    CampaignCreateRequest,
    AccountAttachmentConfig,
)
from gtm.skills.emailbison_campaign.patterns import (
    get_salutations,
    get_closings,
)

def deploy_campaign_cell(cell_id: str, sequence_steps: list[dict] = None):
    """Deploy a campaign cell to Email Bison."""
    cell = get_cell(cell_id)
    config = cell["brief"].get("emailbison_config", {})

    if not config.get("auto_create"):
        return {"success": False, "message": "auto_create disabled"}

    manager = CampaignManager()
    request = CampaignCreateRequest(
        client_code=cell["client_code"],
        campaign_name=f"{cell['cell_code']} | Live",
        template=config.get("template", "business_os_default"),
        account_config=AccountAttachmentConfig(
            mode=config.get("account_mode", "immediate")
        ),
        cell_id=cell_id,
    )

    # Optioneel: sequence steps meegeven
    if sequence_steps:
        result = manager.create_campaign_with_sequence(
            request,
            sequence_title=f"{cell['cell_code']} | Sequence",
            steps=sequence_steps
        )
    else:
        result = manager.create_campaign(request)

    return result
```

### Via Edge Function (voor externe integraties)

```bash
# Create campaign with sequence steps
curl -X POST "https://gjhbbyodrbuabfzafzry.supabase.co/functions/v1/emailbison-campaign-create" \
  -H "Authorization: Bearer ${SUPABASE_ANON_KEY}" \
  -H "Content-Type: application/json" \
  -d '{
    "client_code": "FRTC",
    "campaign_name": "FRTC | EN | Test",
    "sequence_steps": [
      {
        "order": 1,
        "email_subject": "quick question about {company_name}",
        "email_body": "Hi {first_name},\n\nI noticed {company_name}...",
        "wait_in_days": 1,
        "thread_reply": false,
        "variant": false
      }
    ],
    "mode": "immediate"
  }'

# Create with A/B variants (4 variants in step 1)
curl -X POST "https://gjhbbyodrbuabfzafzry.supabase.co/functions/v1/emailbison-campaign-create" \
  -H "Authorization: Bearer ${SUPABASE_ANON_KEY}" \
  -H "Content-Type: application/json" \
  -d '{
    "client_code": "PESC",
    "campaign_name": "PESC | NL | Tech",
    "sequence_steps": [
      {
        "order": 1,
        "email_subject": "internationaal uitbreiden",
        "email_body": "Variant 1 content...",
        "wait_in_days": 1,
        "variant": false,
        "thread_reply": false
      },
      {
        "order": 2,
        "email_subject": "internationaal uitbreiden",
        "email_body": "Variant 2 content...",
        "wait_in_days": 1,
        "variant": true,
        "variant_from_step_id": 1,
        "thread_reply": false
      }
    ],
    "mode": "immediate"
  }'

# Link to existing Email Bison campaign (skip creation)
curl -X POST "https://gjhbbyodrbuabfzafzry.supabase.co/functions/v1/emailbison-campaign-create" \
  -H "Authorization: Bearer ${SUPABASE_ANON_KEY}" \
  -H "Content-Type: application/json" \
  -d '{
    "client_code": "PESC",
    "campaign_name": "PESC | NL | Tech",
    "emailbison_campaign_id": "1258",
    "skip_sequence_creation": true,
    "mode": "immediate"
  }'
```

### Sequence Step Fields

| Veld | Type | Verplicht | Beschrijving |
|------|------|-----------|--------------|
| `order` | integer | Ja | Volgorde in sequence (1, 2, 3...) |
| `email_subject` | string | Ja | Onderwerp regel |
| `email_body` | string | Ja | Email body (met Spintax support) |
| `wait_in_days` | integer | Ja | Wachtdagen na vorige step (min 1) |
| `variant` | boolean | Ja | `false` = hoofd step, `true` = A/B variant |
| `variant_from_step_id` | integer | Bij variant | ID van parent step (voor A/B testing) |
| `thread_reply` | boolean | Ja | Of dit een reply in thread is |

## Error Handling

- Geen warmed inboxes: `can_create = False` met warning
- Email Bison API error: retry 3x, dan error response
- Sequence steps invalid: error met details

## Sequence Variants (A/B Testing)

Email Bison ondersteunt A/B testing via **sequence step variants**. Meerdere emails kunnen als varianten van dezelfde stap worden geconfigureerd. Email Bison roteert willekeurig tussen varianten voor elke lead.

### Hoe varianten werken

- **Hoofd step** (`variant: false`): De primaire email step
- **Variant steps** (`variant: true`, `variant_from_step_id: <parent_id>`): Alternatieve versies van dezelfde step
- Alle varianten hebben hetzelfde `order` nummer in de UI, maar technisch opeenvolgende IDs
- Email Bison verdeelt leads gelijkmatig over alle actieve varianten

### API Endpoints (v1.1)

Gebruik altijd de **v1.1** endpoints voor sequence management:

```bash
# Create sequence with variants
POST /api/campaigns/v1.1/{campaign_id}/sequence-steps

# Update sequence (including variants)
PUT /api/campaigns/v1.1/sequence-steps/{sequence_id}
```

### Voorbeeld: 4 Varianten in Step 1

```bash
# Eerst hoofd step aanmaken
curl -X POST "https://mail.scaleyourleads.com/api/campaigns/v1.1/1258/sequence-steps" \
  -H "Authorization: Bearer ${EMAIL_BISON_API_KEY}" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "PESC | NL | Tech",
    "sequence_steps": [{
      "email_subject": "internationaal uitbreiden",
      "order": 1,
      "email_body": "{Hi|Hallo} {FIRST_NAME},\\n\\nVariant 1 content...",
      "wait_in_days": 1,
      "variant": false,
      "thread_reply": false
    }]
  }'

# Update met alle 4 varianten
# Let op: gebruik step IDs uit response en variant_from_step_id (niet variant_from_step!)
curl -X PUT "https://mail.scaleyourleads.com/api/campaigns/v1.1/sequence-steps/1202" \
  -H "Authorization: Bearer ${EMAIL_BISON_API_KEY}" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "PESC | NL | Tech",
    "sequence_steps": [
      {
        "id": 7024,
        "email_subject": "internationaal uitbreiden",
        "order": 1,
        "email_body": "Variant 1...",
        "wait_in_days": 1,
        "variant": false,
        "thread_reply": false
      },
      {
        "id": 7025,
        "email_subject": "internationaal uitbreiden",
        "order": 2,
        "email_body": "Variant 2...",
        "wait_in_days": 1,
        "variant": true,
        "variant_from_step_id": 7024,
        "thread_reply": false
      },
      {
        "id": 7026,
        "email_subject": "background checks meerdere landen",
        "order": 3,
        "email_body": "Variant 3...",
        "wait_in_days": 1,
        "variant": true,
        "variant_from_step_id": 7024,
        "thread_reply": false
      },
      {
        "id": 7027,
        "email_subject": "internationale background checks",
        "order": 4,
        "email_body": "Variant 4...",
        "wait_in_days": 1,
        "variant": true,
        "variant_from_step_id": 7024,
        "thread_reply": false
      }
    ]
  }'
```

### Belangrijke velden

| Veld | Type | Beschrijving |
|------|------|--------------|
| `variant` | boolean | `false` = hoofd step, `true` = variant van andere step |
| `variant_from_step_id` | integer | ID van de parent step (alleen voor varianten) |
| `variant_from_step` | integer | **Deprecated** - gebruik `variant_from_step_id` |
| `order` | integer | Volgorde binnen sequence (1, 2, 3, 4...) |

### Veelvoorkomende fouten

1. **Duplicate order values**: Email Bison API accepteert geen duplicate `order` values bij create. Update (PUT) werkt wel met bestaande steps.
2. **Verkeerd variant veld**: Gebruik `variant_from_step_id` (met `_id` suffix), niet `variant_from_step`
3. **wait_in_days = 0**: Minimaal 1 voor alle steps
4. **Oude API versie**: Gebruik `/v1.1/` endpoints, niet legacy `/campaigns/{id}/sequence-steps`

### Campaign voorbeeld structuur

```
Campaign: PESC | NL | Tech (ID: 1258)
  └── Sequence: 1202
      ├── Step 7024 (order 1): Variant 1 - "vertragen door handmatig werk"
      ├── Step 7025 (order 2): Variant 2 - "onnodig complex" [variant_of: 7024]
      ├── Step 7026 (order 3): Variant 3 - "langer duren" [variant_of: 7024]
      └── Step 7027 (order 4): Variant 4 - "stroef verlopen" [variant_of: 7024]
```

## Future Extensions

- [ ] Health check filtering (bounces, replies)
- [ ] Meerdere campaign templates (aggressive, pilot, etc.)
- [ ] Campaign update/pauze/resume via CLI
- [x] Email Bison spintax pattern library
- [x] Sequence varianten (A/B testing) documentatie
- [ ] Sequence builder CLI tool
- [ ] Automatische sequence selectie gebaseerd op cell type
