# SentioCX Prompt - HUIDIG Style + CSUITE (C-Suite Efficiency) Persona (V1)

> Focus: Cost, efficiency, ROI
> Start words: Cut, Scale, Deliver

---

## Prompt

```
You are an assistant creating three value propositions for SentioCX ExpertLoop.

TARGET PERSONA: C-Suite Executives (CSUITE)
- Focus: Cost reduction, operational efficiency, ROI
- Pain points: Rising costs, headcount pressure, margin compression

INPUT: Company description and context
OUTPUT: Three bullet points tailored to that specific company

OUTPUT RULES - STRICT:

- Exactly 3 bullet points
- Each bullet: 12-20 words (hard limit: max 20)
- Period (.) required at end of each bullet
- NO company names in the bullets
- NO adjectives before verbs (FORBIDDEN: "faster", "better", "improved", "enhanced")

STRUCTURE PER BULLET:

Bullet 1 - Cut [cost category] [percentage] without [quality loss] using [mechanism] from [system] to [destination].
  → MUST include "Cut" as first word
  → MUST include percentage (e.g., "40%", "50%")
  → MUST include "without" + quality/cost concern
  → Cost category by industry:
     STAFFING: "recruitment costs", "time-to-hire"
     FINANCIAL/BANKING: "service delivery costs", "operational expenses"
     HEALTHCARE: "administrative costs", "coordination overhead"
     ENGINEERING/TECHNICAL: "project overhead", "delivery costs"
     SAAS/SOFTWARE: "support costs", "customer acquisition costs"
  → Mechanism: "AI routing", "intent-based matching", "automated triaging"
  → Quality loss: "quality loss", "hiring standards", "service quality"
  → EXAMPLE GOOD: "Cut recruitment costs 40% without quality loss using AI routing from Service Cloud to hiring teams."
  → EXAMPLE BAD: "Reduce costs and improve efficiency with..." (wrong verb + no percentage)

Bullet 2 - Scale [operation] [multiple] without adding [resource] using [mechanism] based on [criterion 1] and [criterion 2].
  → MUST include "Scale" as first word
  → MUST include multiple: "2x", "3x", "10x" or "doubling"
  → MUST include "without adding [specific resource]"
  → MUST include "and" between 2 criteria
  → Operation: "hiring", "support", "delivery", "operations"
  → Resource: "headcount", "FTEs", "staff", "recruiters", "support agents"
  → EXAMPLE: "Scale hiring operations 2x without adding headcount using AI matching based on role type and urgency."

Bullet 3 - Deliver [outcome] at lower [cost metric] without [business risk] using [mechanism] for [specific result].
  → MUST include "Deliver" as first word
  → MUST include "at lower" + cost metric
  → MUST include "without" + business risk
  → Cost metric: "cost per placement", "cost per hire", "cost per ticket", "unit cost"
  → Business risk by industry:
     STAFFING: "candidate quality drops"
     FINANCIAL/BANKING: "compliance issues"
     HEALTHCARE: "patient satisfaction decline"
     ENGINEERING/TECHNICAL: "delivery delays"
     SAAS/SOFTWARE: "churn increase"
  → EXAMPLE: "Deliver placements at lower cost per hire without candidate quality drops using AI Supervisor for faster matching."

CONTEXT PRIORITY (keep maximum context):

ALWAYS use at least 2 of these in bullet 1:
- Scale (numbers: employees, users, assets, customers, daily volume)
- Location (countries, cities, markets, regions)
- Financial context (revenue, AUM, funding, valuation)

IF bullet exceeds 20 words, remove in this order:
1. Adjectives (FORBIDDEN: "faster", "better", "major", "key", "critical")
2. Unnecessary adverbs ("significantly" can be removed if needed)
3. Only then: less important context details

PERFECT EXAMPLES (all 14-20 words):

STAFFING (Hays - high volume recruitment):
- Cut recruitment costs 40% without quality loss using AI routing from Service Cloud to hiring teams.
- Scale hiring operations 2x without adding headcount using AI matching based on role type and urgency.
- Deliver placements at lower cost per hire without candidate quality drops using AI Supervisor for faster matching.

FINANCIAL (City National Bank):
- Cut service delivery costs 35% without quality loss using AI routing from Service Cloud to bankers.
- Scale advisory services 2x without adding FTEs using intent-based matching based on client tier and request type.
- Deliver wealth management at lower unit cost without compliance issues using AI Supervisor for priority handling.

SAAS (Smartcat - content operations):
- Cut support costs 40% without quality loss using AI routing from Service Cloud to content teams.
- Scale localization operations 3x without adding headcount using AI matching based on language and content format.
- Deliver translations at lower cost per project without deadline misses using AI Supervisor for workflow routing.

ENGINEERING (ALTEN):
- Cut project overhead 30% without delivery delays using AI routing from Service Cloud to engineering teams.
- Scale project delivery 2x without adding delivery managers using AI matching based on domain and urgency.
- Deliver engineering services at lower cost per project without expertise gaps using AI Supervisor for consultant allocation.

GENERATE FOR THIS INPUT:
[PASTE COMPANY CONTEXT]
```

---

## Key Differences from Other Personas

| Aspect | CX Leadership | OPS (Contact Center) | TECH (Digital/Tech) | CSUITE (this prompt) |
|--------|---------------|---------------------|---------------------|---------------------|
| Focus | Experience, satisfaction | Efficiency, SLAs | Integration, automation | Cost, ROI, efficiency |
| Bullet 1 verb | Improve/Deliver | Route | Automate | Cut |
| Bullet 2 verb | Route (general) | Match (by intent to cut) | Integrate (in days not months) | Scale (2x/3x without adding) |
| Bullet 3 verb | Scale | Hit/Maintain | Deploy | Deliver |
| Key phrase B1 | "seamless handoff" | "on first contact" | "via API without [pain]" | "X% without quality loss" |
| Key phrase B2 | "based on [criteria]" | "by intent to cut [metric]" | "in days not [longer timeframe]" | "2x/3x without adding headcount" |
| Key phrase B3 | "without [pain point]" | "without adding [resource]" | "without [technical pain]" | "at lower cost without [risk]" |

---

## Test Checklist (for 30 companies)

- [ ] Bullet 1 starts with "Cut"
- [ ] Bullet 1 includes percentage (e.g., "40%")
- [ ] Bullet 1 includes "without" + quality loss
- [ ] Bullet 2 starts with "Scale"
- [ ] Bullet 2 includes multiple ("2x", "3x")
- [ ] Bullet 2 includes "without adding [resource]"
- [ ] Bullet 3 starts with "Deliver"
- [ ] Bullet 3 includes "at lower" + cost metric
- [ ] Bullet 3 includes "without" + business risk
- [ ] All bullets 12-20 words
- [ ] All bullets end with period
- [ ] No adjectives before verbs
- [ ] Context (scale + location/financial) preserved in bullet 1

---

*Created: 2026-03-29*
*Status: Ready for testing*
