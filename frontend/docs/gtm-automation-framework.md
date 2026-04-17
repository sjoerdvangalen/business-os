# GTM Automation Framework — Van 24 Cells naar One-Click Campaigns

> Reverse-engineered uit SentioCX case: hoe schalen we van handmatige campaign setup naar geautomatiseerde GTM uitvoering?

---

## De Inzichten uit SentioCX

### Wat werkte:
1. **Matrix structuur**: 4 personas × 6 verticals = 24 testbare cells
2. **Eric-stijl**: Actiegerichte value props (Connect/Match/Cut vs Improve/Route/Scale)
3. **Cell code**: `CLIENT|LANG|Solution|Vertical|Persona|Region` = traceerbaar
4. **Trigger events**: Per vertical specifieke signalen om op te pitchen

### Wat traag was:
1. Handmatig 24 cells uitschrijven = 12 uur
2. Geen gestandaardiseerde lead sourcing per vertical
3. Copy paste naar PlusVibe per cell
4. Geen automatische performance tracking per cell

---

## Het Schaalbare Framework

### Architectuur: 4 Lagen

```
Layer 1: INPUT
├── Client profiel (research/CLIENT.md)
├── Product/solution definitie
├── 4 persona archetypes (CX/OPS/TECH/CSUITE)
└── 6 vertical archetypes (SAAS/FIN/HLT/STF/MFG/GEN)

Layer 2: TEMPLATE ENGINE
├── Persona templates (action verbs, pain points, angles)
├── Vertical context (customer terms, expert roles)
├── Value prop formulas (Eric-style)
└── Email sequence templates (3-step)

Layer 3: GENERATION
├── 24 Campaign Cells (auto-generated)
├── Value props (3 per cell)
├── Email sequences (personalized)
└── Lead sourcing queries (per vertical)

Layer 4: EXECUTION
├── A-Leads API (contact discovery)
├── TryKitt verification (email waterfall)
├── PlusVibe upload (auto-sequences)
└── Business OS sync (performance tracking)
```

---

## Layer 1: Input Specificatie

### Client Research Template

```yaml
# research/CLIENT.md
client_code: SECX
name: SentioCX
product_category: ai_cx_platform
solution_statement: AI-powered routing from Service Cloud to experts
pricing_tier: enterprise
reference_accounts: [Hays, Bullhorn, City National Bank, Smartcat, ALTEN]

verticals:
  - SAAS: { active: true, proof: Smartcat }
  - FIN:  { active: true, proof: City National Bank }
  - HLT:  { active: true, proof: null }
  - STF:  { active: true, proof: Hays }
  - MFG:  { active: true, proof: ALTEN }
  - GEN:  { active: false }

personas:
  - CX:     { active: true, priority: 1 }
  - OPS:    { active: true, priority: 2 }
  - TECH:   { active: true, priority: 3 }
  - CSUITE: { active: true, priority: 4 }

trigger_events:
  SAAS: [high_ticket_volume, low_csat, churn_signal, hiring_cx]
  FIN:  [compliance_sla_pressure, advisor_turnover, client_complaints]
  HLT:  [patient_satisfaction_drops, scheduling_backlogs]
  STF:  [candidate_drop_off, recruiter_capacity, time_to_fill]
  MFG:  [distributor_complaints, product_launch_strain]
```

---

## Layer 2: Template Engine

### Persona Templates (4x)

```yaml
# templates/personas/CX.yaml
persona_code: CX
persona_name: CX Leadership
titles: [VP Customer Experience, Head of CX, Director of Success]
focus: experience, satisfaction, retention, NPS
pain_points: [fragmented_handoffs, low_csat, high_churn]
action_verbs: [Connect, Elevate, Reduce]
formula_bullet1: Connect {customer} directly to {expert} without {pain}
formula_bullet2: Match {inquiry} automatically based on intent, not {old_way}
formula_bullet3: {result} without expanding your {team} or {negative_outcome}
```

```yaml
# templates/personas/OPS.yaml
persona_code: OPS
persona_name: Contact Center Ops
titles: [VP Contact Center, Head of Support Ops, WFM Director]
focus: efficiency, SLAs, handle times, FCR
pain_points: [sla_misses, high_handle_times, queue_backlogs]
action_verbs: [Route, Match, Handle]
formula_bullet1: Route {inquiry} automatically to {expert} on first contact
formula_bullet2: Match {request} by intent to cut {metric} {percentage}
formula_bullet3: Hit {target} consistently without adding {resource}
```

```yaml
# templates/personas/TECH.yaml
persona_code: TECH
persona_name: Digital/Tech Leadership
titles: [CTO, VP Engineering, Director of Architecture]
focus: integration, automation, APIs, technical debt
pain_points: [integration_complexity, legacy_systems, dev_backlog]
action_verbs: [Automate, Deploy, Integrate]
formula_bullet1: Automate {routing} from {system} to {destination} via API
formula_bullet2: Deploy {feature} without {pain_point}
formula_bullet3: Integrate with {existing_stack} in {timeframe}, not {alternative}
```

```yaml
# templates/personas/CSUITE.yaml
persona_code: CSUITE
persona_name: C-Suite Efficiency
titles: [CEO, COO, CFO, Managing Director]
focus: cost, efficiency, ROI, scaling
pain_points: [budget_pressure, scaling_challenges, margin_compression]
action_verbs: [Cut, Scale, Deliver]
formula_bullet1: Cut {cost_center} {percentage} without {negative_tradeoff}
formula_bullet2: Scale {metric} {multiplier}x without adding {resource}
formula_bullet3: Deliver {outcome} at {percentage} lower cost per {unit}
```

### Vertical Context (6x)

```yaml
# templates/verticals/SAAS.yaml
vertical_code: SAAS
vertical_name: SaaS/Software
customer_term: users
expert_terms: [product specialists, CSMs, success managers]
typical_tools: [Service Cloud, Zendesk, Intercom]
trigger_events: [high_ticket_volume, low_csat, churn_signal, hiring_cx]
research_sources: [G2 reviews, job postings, funding news]
```

```yaml
# templates/verticals/FIN.yaml
vertical_code: FIN
vertical_name: Financial Services
customer_term: clients
expert_terms: [private bankers, wealth advisors, relationship managers]
typical_tools: [Salesforce FSC, Temenos, core banking systems]
trigger_events: [compliance_sla_pressure, advisor_turnover, aum_growth]
research_sources: [FINRA, fund databases, regulatory filings]
```

```yaml
# templates/verticals/HLT.yaml
vertical_code: HLT
vertical_name: Healthcare
customer_term: patients
expert_terms: [care coordinators, specialists, nurses]
typical_tools: [Epic, Cerner, EHR systems]
trigger_events: [patient_satisfaction_drops, scheduling_backlogs, accreditation]
research_sources: [HIMSS, CMS data, hospital job boards]
```

```yaml
# templates/verticals/STF.yaml
vertical_code: STF
vertical_name: Staffing/Recruitment
customer_term: candidates
expert_terms: [recruiters, talent consultants, sourcers]
typical_tools: [Bullhorn, Workday, Greenhouse]
trigger_events: [candidate_drop_off, recruiter_capacity, time_to_fill_spike]
research_sources: [job posting volume, hiring announcements]
```

```yaml
# templates/verticals/MFG.yaml
vertical_code: MFG
vertical_name: Manufacturing
customer_term: distributors
expert_terms: [sales engineers, account managers, technical specialists]
typical_tools: [Salesforce, SAP, dealer management systems]
trigger_events: [distributor_complaints, product_launch_strain, order_delays]
research_sources: [industry publications, distributor networks]
```

```yaml
# templates/verticals/GEN.yaml
vertical_code: GEN
vertical_name: Generic/Other
customer_term: customers
expert_terms: [specialists, success teams, account managers]
typical_tools: [CRM systems, helpdesk software]
trigger_events: [support_volume_spike, satisfaction_drops, team_constraints]
research_sources: [general business signals]
```

---

## Layer 3: Generation Logic

### Campaign Cell Generator

```python
# Pseudocode voor gtm/campaign-generator.py

def generate_campaign_cells(client_config: dict) -> list[CampaignCell]:
    cells = []

    for persona_code, persona_config in client_config['personas'].items():
        if not persona_config['active']:
            continue

        persona_template = load_persona_template(persona_code)

        for vertical_code, vertical_config in client_config['verticals'].items():
            if not vertical_config['active']:
                continue

            vertical_context = load_vertical_template(vertical_code)

            # Generate cell
            cell = CampaignCell(
                cell_code=f"{client_config['client_code']}|EN|{client_config['solution_code']}|{vertical_code}|{persona_code}|NA",
                name=f"{client_config['client_code']} {vertical_code} {persona_code} Q2",
                value_props=generate_value_props(persona_template, vertical_context, client_config),
                trigger_events=vertical_config['triggers'],
                target_titles=persona_template['titles'],
                lead_sourcing_query=generate_lead_query(vertical_code, persona_template),
                email_sequence=generate_sequence(persona_template, vertical_context)
            )
            cells.append(cell)

    return cells

def generate_value_props(persona: dict, vertical: dict, client: dict) -> list[str]:
    """Generate 3 Eric-style value props"""

    # Bullet 1: Connect/Route/Automate/Cut
    bullet1 = persona['formula_bullet1'].format(
        customer=vertical['customer_term'],
        expert=vertical['expert_terms'][0],
        inquiry=f"{vertical['customer_term']} issues",
        system=vertical['typical_tools'][0],
        pain="escalation delays"
    )

    # Bullet 2: Match automatically
    bullet2 = persona['formula_bullet2'].format(
        inquiry=f"{vertical['customer_term']} inquiries",
        request=f"{vertical['customer_term']} requests",
        old_way="queue position",
        metric="handle times",
        percentage="40%",
        feature="intent-based matching"
    )

    # Bullet 3: Result without resource
    bullet3 = persona['formula_bullet3'].format(
        result="Reduce churn 23%" if persona['code'] == 'CX' else "Hit SLA targets",
        team=f"{vertical['expert_terms'][0].split()[-1]} team",
        resource="headcount",
        negative_outcome="experience degradation",
        cost_center="support costs",
        percentage="35%",
        metric="capacity",
        multiplier="2"
    )

    return [bullet1, bullet2, bullet3]
```

### Output: 24 Campaign Cells JSON

```json
{
  "client_code": "SECX",
  "solution": "AI-Powered CX Routing",
  "cells": [
    {
      "cell_code": "SECX|EN|AI-Routing|SaaS|CX|NA",
      "name": "SECX SaaS CX NA Q2",
      "persona": "CX Leadership",
      "vertical": "SaaS",
      "value_props": [
        "Connect users directly to product specialists without escalation delays",
        "Match onboarding issues automatically to CSMs based on intent, not queue position",
        "Cut churn 23% without expanding your success team or response times"
      ],
      "trigger_events": ["high_ticket_volume", "low_csat", "churn_signal"],
      "target_titles": ["VP Customer Experience", "Head of Customer Success"],
      "lead_query": {
        "industries": ["Software", "SaaS"],
        "company_size": [50, 500],
        "titles": ["VP Customer Experience", "Head of Customer Success"],
        "signals": ["hiring_cx", "recent_funding"]
      },
      "email_sequence": {
        "step1": "Observation + Value Prop 1 + CTA",
        "step2": "Social proof + Value Prop 2 + Soft CTA",
        "step3": "Breakup + Value Prop 3 + Final CTA"
      }
    }
    // ... 23 more cells
  ]
}
```

---

## Layer 4: Execution Pipeline

### De Flow

```
Step 1: Generate
Input: research/CLIENT.md
↓
Template Engine (persona + vertical fusion)
↓
Output: 24 Campaign Cells JSON

Step 2: Discover
Input: 24 cells with lead queries
↓
A-Leads API (parallel per cell)
↓
TryKitt Waterfall (email verification)
↓
Kimi Enrichment (personalization hooks)
↓
Output: leads table (tagged with cell_code)

Step 3: Upload
Input: leads + email sequences
↓
PlusVibe API (auto-campaign creation)
↓
Sequence assignment per cell
↓
Variable mapping
↓
Output: Live campaigns in PlusVibe

Step 4: Sync
Input: PlusVibe campaign IDs
↓
sync-plusvibe-campaigns (edge function)
↓
campaigns table (Supabase)
↓
Performance tracking per cell
↓
Output: Real-time dashboard

Step 5: Optimize
Input: Performance metrics per cell
↓
Top 20% cells → Scale 2x
Bottom 20% cells → Analyze/pause
Middle 60% → A/B test
↓
Output: Optimized cell portfolio
```

### Automation Commands

```bash
# One-command campaign generation
npx tsx gtm/generate-campaigns.ts --client SECX --output campaigns/

# Lead discovery for all cells
npx tsx gtm/discover-leads.ts --cells campaigns/secx-cells.json

# Upload to PlusVibe
npx tsx gtm/upload-to-plusvibe.ts --cells campaigns/secx-cells.json --dry-run

# Full pipeline (generate + discover + upload)
npx tsx gtm/run-campaign-pipeline.ts --client SECX
```

---

## Performance Tracking per Cell

### Database Schema

```sql
-- campaign_cells table (uitbreiding)
ALTER TABLE campaign_cells ADD COLUMN metrics JSONB DEFAULT '{}';

-- Metrics structuur per cell:
{
  "sent_count": 0,
  "open_count": 0,
  "reply_count": 0,
  "positive_reply_count": 0,
  "meeting_count": 0,
  "bounce_rate": 0,
  "reply_rate": 0,
  "meeting_rate": 0,
  "tier": "testing" // testing | scaling | winning | paused
}
```

### Cell Tiering Logic

```python
# Auto-tiering based on performance
def update_cell_tier(cell: CampaignCell) -> str:
    if cell.metrics.reply_rate > 8%:
        return "winning"  # Scale budget 2x
    elif cell.metrics.reply_rate > 5%:
        return "scaling"  # Continue, test variants
    elif cell.metrics.reply_rate > 2%:
        return "testing"  # A/B test value props
    else:
        return "paused"   # Analyze and iterate
```

### Dashboard View

```sql
-- Cell performance overview
SELECT
  cell_code,
  name,
  persona,
  vertical,
  metrics->>'reply_rate' as reply_rate,
  metrics->>'meeting_rate' as meeting_rate,
  metrics->>'tier' as tier
FROM campaign_cells
WHERE client_id = 'secx_uuid'
ORDER BY (metrics->>'reply_rate')::numeric DESC;
```

---

## Implementation Roadmap

### Fase 1: Template Engine (Week 1)
- [ ] 4 persona YAML templates
- [ ] 6 vertical YAML templates
- [ ] Fusion logic (persona + vertical = value props)
- [ ] JSON output validator

### Fase 2: Lead Discovery Integration (Week 2)
- [ ] A-Leads API query generator per vertical
- [ ] Parallel discovery (24 cells = 24 concurrent calls)
- [ ] TryKitt waterfall integration
- [ ] Lead-to-cell tagging

### Fase 3: PlusVibe Upload (Week 3)
- [ ] Campaign auto-creation API
- [ ] Sequence template engine
- [ ] Variable mapping
- [ ] Dry-run mode

### Fase 4: Business OS Integration (Week 4)
- [ ] campaign_cells table uitbreiding
- [ ] Auto-tiering logic
- [ ] Dashboard queries
- [ ] Alerting (winning/paused cells)

### Fase 5: One-Command Pipeline (Week 5)
- [ ] CLI interface
- [ ] Error handling & retry logic
- [ ] Logging & audit trail
- [ ] Documentation

---

## Eerste Gebruik: SentioCX

### Setup

```bash
# 1. Client research invullen
cp templates/client-research.yaml research/SECX.md
# → Edit met SentioCX specifieke info

# 2. Run full pipeline
cd ~/ai-projects/business-os
npx tsx gtm/run-campaign-pipeline.ts --client SECX

# 3. Monitor in dashboard
open https://business-os.vercel.app/campaigns?client=SECX
```

### Expected Output

```
24 Campaign Cells Generated
↓
~2,400 Leads Discovered (100 per cell gemiddeld)
↓
~1,800 Verified Emails (75% verification rate)
↓
24 Active PlusVibe Campaigns
↓
Real-time performance per cell
```

---

## Voordeel vs. Handmatig

| Aspect | Handmatig (oud) | Geautomatiseerd (nieuw) |
|--------|----------------|------------------------|
| Setup tijd | 12+ uur | 30 minuten |
| Consistentie | Variabel per cell | 100% consistent |
| A/B testen | Moeilijk | Per cell automatisch |
| Scaling | Traag | One-click naar nieuwe verticals |
| Tracking | Fragmented | Real-time per cell |
| Iteratie | Weken | Dagen |

---

*Framework versie: 1.0*
*Gebaseerd op SentioCX case study, 2026-03-29*
