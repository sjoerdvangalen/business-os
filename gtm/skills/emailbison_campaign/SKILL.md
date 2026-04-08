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
├── config.py                # Data classes (settings, requests, previews)
├── templates.py             # Campaign templates
├── emailbison_campaign.py   # Core CampaignManager class
└── cli.py                   # CLI interface
```

## Integratie met Orchestrator

Voor automatische campaign creatie in step 8:

```python
# In gtm/orchestrator.py
from gtm.skills.emailbison_campaign import (
    CampaignManager,
    CampaignCreateRequest,
    AccountAttachmentConfig,
)

def deploy_campaign_cell(cell_id: str):
    cell = get_cell(cell_id)
    config = cell["brief"].get("emailbison_config", {})

    if config.get("auto_create"):
        manager = CampaignManager()
        request = CampaignCreateRequest(
            client_code=cell["client_code"],
            campaign_name=f"{cell['cell_code']} | Live",
            template=config.get("template", "business_os_default"),
            sequence_id=config.get("sequence_id"),
            account_config=AccountAttachmentConfig(mode=config.get("account_mode", "immediate")),
            cell_id=cell_id,
        )
        result = manager.create_campaign(request)
        return result
```

## Error Handling

- Geen warmed inboxes: `can_create = False` met warning
- Email Bison API error: retry 3x, dan error response
- Sequence niet gevonden: fallback naar default (geen sequence)

## Future Extensions

- [ ] Health check filtering (bounces, replies)
- [ ] Meerdere templates (aggressive, pilot, etc.)
- [ ] Campaign update/pauze/resume via CLI
- [ ] Automatische sequence selectie gebaseerd op cell type
