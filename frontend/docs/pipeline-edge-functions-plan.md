# Pipeline Plan: Edge-Function-Only Architecture

> ⚠️ **DEPRECATED — HISTORICAL REFERENCE ONLY. DO NOT USE FOR IMPLEMENTATION.**
>
> Dit document beschrijft een vroeg architectuurplan met verouderde phase enums (`clients.phase`),
> een oude strategie-structuur (`clients.strategy`), en PlusVibe/EmailBison door elkaar.
> **Authoritative bronnen: `CLAUDE.md` en `ROADMAP.md`.**

---

> Van intake tot live campagne, volledig in Supabase Edge Functions (Deno/TypeScript), zonder n8n.

## Huidige Staat

### Database (Clients Tabel)
```
phase ENUM:
  0_onboarding → 1_strategy → 2_internal_gate → 3_client_approval → 4_infra
  → 5_data_pipeline → 6_campaign_setup → 7_pilot → 8_H1_testing → 9_F1_testing
  → 10_CTA1_testing → 11_soft_launch → 12_scaling

intake_status ENUM:
  none | form_submitted | review_required | research_started | synthesis_ready

Belangrijke velden:
- onboarding_form (JSONB) - normalized intake
- onboarding_form_raw (JSONB) - raw Jotform payload
- strategy (JSONB) - GTM synthesis output
- exa_research (JSONB) - raw Exa output [NIEUW]
- gtm_strategy_doc_url (TEXT) - Google Doc URL [NIEUW]
- messaging_doc_url (TEXT) - Messaging doc URL [NIEUW]
- slack_channel_id (TEXT) - per-client Slack channel
- gate_status, gate_score, gate_feedback - internal review
```

### Bestaande Integraties
- **Slack**: `gtm/lib/slack.py` - webhook based
- **Google Docs**: `gtm/lib/google_docs.py` - Python, moet naar Deno
- **AI**: `ai-enrich-contact` edge function (Kimi K2.5 pattern)
- **Exa**: Nog niet geimplementeerd

## Architectuur: 5 Edge Functions + 1 Cron

```
Jotform Webhook
       ↓
[webhook-jotform-intake] (DONE)
       ↓
intake_status = form_submitted
       ↓
[edge-function-research-orchestrator] ← NEW
       ↓
1. Exa deep research (async create → poll)
2. Store in clients.exa_research
3. Trigger synthesis
       ↓
[edge-function-synthesis] ← NEW
       ↓
1. Kimi/OpenAI synthesis (intake + research → strategy)
2. Store in clients.strategy
3. intake_status = synthesis_ready
4. phase = 1_strategy
       ↓
[edge-function-create-gtm-doc] ← NEW
       ↓
1. Create Google Doc (strategy → doc)
2. Store URL in clients.gtm_strategy_doc_url
3. Slack alert: "Nieuw GTM strategy doc klaar voor review"
       ↓
[MANUAL: Internal gate review]
       ↓
gate_status = approved → phase = 3_client_approval
       ↓
[edge-function-client-approval] ← NEW
       ↓
1. Slack notificatie naar klant
2. Wacht op approval (via webhook of manual update)
       ↓
Klant approved_at gezet
       ↓
[edge-function-campaign-prep] ← NEW
       ↓
1. Genereer messaging doc
2. A-leads scraping trigger
3. Campagne setup in PlusVibe/EmailBison
4. phase = 6_campaign_setup
       ↓
pg_cron trigger: [campaign-launcher] (elke 15 min)
       ↓
Als phase = 6_campaign_setup EN campagne ready → phase = 7_pilot
```

## Stap 1: Research Orchestrator

**Naam**: `edge-function-research-orchestrator`
**Trigger**: clients.UPDATE waar intake_status = 'form_submitted'
**Pattern**: Async job met polling

### Flow:
```typescript
// 1. Receive trigger (webhook or direct call)
// 2. Create Exa research task
const exaResponse = await fetch('https://api.exa.ai/research/v1', {
  method: 'POST',
  headers: { 'Authorization': `Bearer ${EXA_API_KEY}` },
  body: JSON.stringify({
    query: buildExaQuery(client.onboarding_form),
    model: 'exa-research-pro',
    // ... andere params
  })
});
const { id: researchId } = await exaResponse.json();

// 3. Update client: intake_status = 'research_started', exa_research_id = researchId

// 4. Start polling (max 10 min, elke 30 sec)
// 5. Store result in clients.exa_research

// 6. Trigger synthesis function (direct HTTP call)
```

### Nieuwe kolommen:
```sql
ALTER TABLE clients ADD COLUMN exa_research JSONB;
ALTER TABLE clients ADD COLUMN exa_research_id TEXT;
ALTER TABLE clients ADD COLUMN exa_research_status TEXT; -- pending | running | completed | failed
```

## Stap 2: Synthesis

**Naam**: `edge-function-synthesis`
**Trigger**: HTTP call van research orchestrator
**Pattern**: AI call (Kimi via CCR of direct OpenAI)

### Flow:
```typescript
// 1. Fetch client: onboarding_form + exa_research
// 2. Build synthesis prompt (GTM Synthesizer prompt)
// 3. Call AI (Kimi K2.5 via bestaande pattern)
const strategy = await callKimi({
  model: 'kimi-k2-5',
  prompt: buildSynthesisPrompt(intake, research),
  response_format: { type: 'json_object' }
});

// 4. Store: clients.strategy = strategy
// 5. Update: intake_status = 'synthesis_ready', phase = '1_strategy'
// 6. Trigger doc creation
```

## Stap 3: Create GTM Doc

**Naam**: `edge-function-create-gtm-doc`
**Trigger**: HTTP call van synthesis
**Pattern**: Google Docs API via Deno

### Flow:
```typescript
// 1. Fetch client.strategy
// 2. Format als Google Doc content
// 3. Create doc via Google Docs API
const doc = await createGoogleDoc({
  title: `GTM Strategy - ${client.name}`,
  content: formatStrategyForDoc(strategy)
});

// 4. Store: clients.gtm_strategy_doc_url = doc.url
// 5. Slack notificatie: "Nieuw GTM strategy doc klaar"
```

### Google Docs in Deno:
- Gebruik `https://esm.sh/googleapis@105` of direct REST API
- OAuth credentials uit environment
- Bestaande Python logic porten naar TypeScript

## Stap 4: Client Approval Handler

**Naam**: `edge-function-client-approval`
**Trigger**: Manual webhook of cron check
**Pattern**: Slack interaction + status update

### Flow:
```typescript
// Optie A: Webhook van intern gate tool
// Optie B: Cron die checkt op gate_status = 'approved'

if (client.gate_status === 'approved' && !client.client_approved_at) {
  // 1. Slack bericht naar klant channel
  await sendSlackMessage({
    channel: client.slack_channel_id,
    text: `GTM Strategy doc klaar voor review: ${client.gtm_strategy_doc_url}`
  });

  // 2. Update phase = '3_client_approval'
}

// Klant approve flow:
// - Manual: update clients.client_approved_at = now()
// - Of Slack button → webhook-slack-interaction handler
```

## Stap 5: Campaign Prep

**Naam**: `edge-function-campaign-prep`
**Trigger**: clients.UPDATE waar client_approved_at is gezet
**Pattern**: Multi-step orchestrator

### Flow:
```typescript
// 1. Genereer messaging doc
const messagingDoc = await createMessagingDoc(client.strategy);
await updateClient({ messaging_doc_url: messagingDoc.url });

// 2. Trigger A-leads scraping
// - Haal ICP criteria uit strategy
// - Start A-leads search job
// - Store job_id in clients.a_leads_job_id

// 3. Setup campagne in PlusVibe/EmailBison
// - Maak campagne aan
// - Configureer sequences
// - Wacht op leads

// 4. Update phase = '6_campaign_setup'
```

## Stap 6: Campaign Launcher (Cron)

**Naam**: `campaign-launcher` (bestaande uitbreiden)
**Trigger**: pg_cron elke 15 minuten
**Pattern**: Check en launch

### Flow:
```typescript
// 1. Zoek clients met phase = '6_campaign_setup'
// 2. Check of A-leads job klaar is
// 3. Check of campagne ready is (genoeg leads, sequences goedgekeurd)
// 4. Zo ja: update phase = '7_pilot', start campagne
// 5. Slack notificatie: "Campagne live voor [client]"
```

## Phase Transitions (Centraal Register)

```typescript
// Unified phase transition handler
const PHASE_TRANSITIONS = {
  '0_onboarding': {
    next: '1_strategy',
    condition: (c) => c.intake_status === 'synthesis_ready',
    action: 'research_complete'
  },
  '1_strategy': {
    next: '2_internal_gate',
    condition: (c) => c.gtm_strategy_doc_url != null,
    action: 'doc_created'
  },
  '2_internal_gate': {
    next: '3_client_approval',
    condition: (c) => c.gate_status === 'approved',
    action: 'gate_approved'
  },
  '3_client_approval': {
    next: '4_infra',
    condition: (c) => c.client_approved_at != null,
    action: 'client_approved'
  },
  // ... etc
};
```

## Environment Variables (Nieuw)

```
# Exa
EXA_API_KEY=

# Google Docs (als nog niet aanwezig)
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_REFRESH_TOKEN=
GOOGLE_DOCS_FOLDER_ID=

# AI Provider (Kimi via CCR of direct)
KIMI_API_KEY=
KIMI_BASE_URL=https://api.kimi.com/coding/

# Slack (bestaand)
SLACK_BOT_TOKEN=
SLACK_WEBHOOK_URL=
```

## Bouwvolgorde

| Stap | Functie | Status | Complexiteit |
|------|---------|--------|--------------|
| 1 | `research-orchestrator` | Nieuw | Medium |
| 2 | `synthesis` | Nieuw | Medium |
| 3 | `create-gtm-doc` | Nieuw | High (Google Auth) |
| 4 | `client-approval` | Nieuw | Low |
| 5 | `campaign-prep` | Nieuw | Medium |
| 6 | `campaign-launcher` | Uitbreiden | Low |

## Data Flow Summary

```
Input: Jotform webhook
  ↓
clients.onboarding_form (JSONB)
  ↓
Exa Research → clients.exa_research (JSONB)
  ↓
AI Synthesis → clients.strategy (JSONB)
  ↓
Google Doc → clients.gtm_strategy_doc_url (TEXT)
  ↓
Internal Gate → clients.gate_status (TEXT)
  ↓
Klant Approval → clients.client_approved_at (TIMESTAMP)
  ↓
Messaging Doc → clients.messaging_doc_url (TEXT)
A-leads Job → clients.a_leads_job_id (TEXT)
  ↓
Campagne Live → phase = '7_pilot'
```

## Openstaande Vragen

1. **AI Provider**: Kimi K2.5 (bestaand) of OpenAI voor synthesis?
2. **Google Docs**: Port Python logic naar Deno, of tijdelijk Python microservice?
3. **A-leads**: Bestaande `find-contacts` edge function hergebruiken?
4. **Campagne setup**: Direct PlusVibe/EmailBison API calls of via worker?

## Risico's

1. **Exa polling timeout**: Edge functions max 400s, Exa kan 5+ min duren
   - Oplossing: Database-gestuurde state machine, niet in-memory polling

2. **Google Auth in Deno**: Minder mature dan Python
   - Oplossing: REST API direct, niet SDK

3. **Complexiteit**: 6 functies met onderlinge afhankelijkheden
   - Oplossing: Duidelijke triggers, idempotency, retry-logic
