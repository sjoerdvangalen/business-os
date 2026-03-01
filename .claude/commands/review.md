# Onboarding Review & Approval

Bekijk de onboarding pipeline status van een klant en verwerk goedkeuringen.

**Usage**: `/review CLIENT_CODE`

## Stappen

### 1. Client opzoeken
- Query `clients` waar `client_code = '$ARGUMENTS'`
- Lees: `onboarding_status`, `onboarding_form`, `research`, `strategy`

### 2. Pipeline Status tonen

Toon een overzicht:

```
ONBOARDING PIPELINE — [CLIENT_CODE] ([client naam])
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

✅ Formulier        [form_submitted / niet ingevuld]
✅ Research          [researched / niet gedaan]
⏳ Strategy          [strategy_done / niet gedaan]
⬜ Copy              [copy_done / niet gedaan]
⬜ Internal Review   [wacht op review]
⬜ Client Review     [wacht op klant]
⬜ Deployed          [live in PlusVibe]
```

### 3. Per voltooide stap: samenvatting tonen

**Als research gedaan:**
- PMF verdict
- Top 3 competitors
- Key pain points
- Aantal research sources

**Als strategy gedaan:**
- Aantal ICPs + namen
- Aantal offers + namen + status (draft/approved)
- Offer type analyse

**Als copy gedaan:**
- Aantal email variants
- Subject lines overview
- Copy status per variant (draft/approved)

### 4. Approval verwerken

Als Sjoerd zegt "approved" of "goedgekeurd":
- Update relevante statussen
- Als research approved → suggereer `/strategy $ARGUMENTS`
- Als strategy approved → update offer statussen, suggereer `/copy $ARGUMENTS`
- Als copy approved → update `onboarding_status` → `'internal_review'`
- Als internal review approved → update naar `'client_review'`

Als Sjoerd extra context geeft:
- Log feedback in `agent_memory` (memory_type: 'review_feedback')
- Pas de research/strategy/copy aan op basis van feedback
- Update de .md file

### 5. Volgende stap suggereren
- Gebaseerd op huidige status, vertel wat de logische volgende actie is
