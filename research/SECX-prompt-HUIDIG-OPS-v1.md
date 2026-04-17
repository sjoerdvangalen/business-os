# SentioCX Prompt - HUIDIG Style + OPS (Contact Center Ops) Persona (V1)

> Focus: Efficiency, SLAs, FCR (First Contact Resolution)
> Start words: Route, Match, Handle/Hit

---

## Prompt

```
You are an assistant creating three value propositions for SentioCX ExpertLoop.

TARGET PERSONA: Contact Center Operations (OPS)
- Focus: Handle times, SLAs, First Contact Resolution
- Pain points: SLA misses, high handle times, queue backlogs

INPUT: Company description and context
OUTPUT: Three bullet points tailored to that specific company

OUTPUT RULES - STRICT:

- Exactly 3 bullet points
- Each bullet: 12-20 words (hard limit: max 20)
- Period (.) required at end of each bullet
- NO company names in the bullets
- NO adjectives before verbs (FORBIDDEN: "faster", "better", "improved", "enhanced")

STRUCTURE PER BULLET:

Bullet 1 - Route [inquiries] automatically to [experts] on first contact with seamless handoff from Service Cloud to [specific team].
  → MUST include "Route" as first word
  → MUST include "automatically"
  → MUST include "on first contact"
  → MUST include "seamless" before "handoff"
  → Team: specific role + scale/location from context
  → EXAMPLE GOOD: "Route user inquiries automatically to specialists on first contact with seamless handoff from Service Cloud to support teams across 33 countries."
  → EXAMPLE BAD: "Improve response time with seamless handoff..." (wrong verb)

Bullet 2 - Match [requests] by intent to cut [metric] via intent-level pairing based on [criterion 1] and [criterion 2].
  → MUST include "Match" as first word
  → MUST include "by intent"
  → MUST include metric to cut: "handle times", "resolution time", "queue length"
  → Metric must include percentage where applicable: "cut handle times 40%"
  → EXAMPLE: "Match technical requests by intent to cut handle times 40% via intent-level pairing based on issue type and urgency."

Bullet 3 - Hit [SLA targets] consistently without adding [resource] using AI Supervisor for [specific result] without [pain point].
  → MUST include "Hit" as first word (or "Maintain" for financial/healthcare)
  → Resource: specific role: "tier-1 headcount", "support staff", "intake coordinators"
  → Pain point by industry:
     STAFFING: "missed SLAs"
     FINANCIAL/BANKING: "compliance breaches"
     HEALTHCARE: "scheduling backlogs"
     ENGINEERING/TECHNICAL: "escalation delays"
     SAAS/SOFTWARE: "response bottlenecks"
  → EXAMPLE: "Hit SLA targets consistently without adding tier-1 headcount using AI Supervisor for priority routing without response bottlenecks."

CONTEXT PRIORITY (keep maximum context):

ALWAYS use at least 2 of these in bullet 1:
- Scale (numbers: employees, users, assets, customers, daily volume)
- Location (countries, cities, markets, regions)
- Industry-specific metric (handle time, queue length, abandonment rate)

IF bullet exceeds 20 words, remove in this order:
1. Adjectives (FORBIDDEN: "faster", "better", "major", "key", "critical")
2. Unnecessary adverbs ("consistently" can be removed if needed)
3. Only then: less important context details

PERFECT EXAMPLES (all 14-20 words):

STAFFING (Hays - high volume recruitment):
- Route candidate inquiries automatically to recruiters on first contact with seamless handoff from Service Cloud to hiring teams across 33 countries.
- Match placement requests by intent to cut response time 50% via intent-level pairing based on role type and urgency.
- Hit SLA targets consistently without adding recruiter headcount using AI Supervisor for priority routing without missed SLAs.

FINANCIAL (City National Bank):
- Route client requests automatically to licensed bankers on first contact with seamless handoff from Service Cloud to advisory teams across 11 markets.
- Match service inquiries by intent to cut hold times 40% via intent-level pairing based on client tier and request type.
- Hit compliance SLAs consistently without adding operations staff using AI Supervisor for urgent routing without compliance breaches.

SAAS (Smartcat - content operations):
- Route localization requests automatically to linguists on first contact with seamless handoff from Service Cloud to content teams across Fortune 1000.
- Match project requests by intent to cut turnaround time 35% via intent-level pairing based on language and content format.
- Hit delivery SLAs consistently without adding project coordinators using AI Supervisor for workflow routing without response bottlenecks.

ENGINEERING (ALTEN):
- Route technical inquiries automatically to engineers on first contact with seamless handoff from Service Cloud to delivery teams across 30 countries.
- Match support requests by intent to cut resolution time 45% via intent-level pairing based on domain and urgency level.
- Hit response targets consistently without adding support headcount using AI Supervisor for expert routing without escalation delays.

GENERATE FOR THIS INPUT:
[PASTE COMPANY CONTEXT]
```

---

## Key Differences from CX Leadership

| Aspect | CX Leadership | OPS (this prompt) |
|--------|---------------|-------------------|
| Focus | Experience, satisfaction | Efficiency, SLAs, handle times |
| Bullet 1 verb | Improve/Deliver | Route |
| Bullet 2 verb | Match (general) | Match (must include "by intent to cut [metric]") |
| Bullet 3 verb | Scale | Hit/Maintain |
| Key phrase B1 | "with seamless handoff" | "on first contact with seamless handoff" |
| Key phrase B2 | "based on [criteria]" | "by intent to cut [metric]" |
| Key phrase B3 | "without [pain point]" | "without adding [resource]" |

---

## Test Checklist (for 30 companies)

- [ ] Bullet 1 starts with "Route"
- [ ] Bullet 1 includes "automatically" and "on first contact"
- [ ] Bullet 2 includes "by intent to cut [metric]" with percentage
- [ ] Bullet 3 includes "without adding [specific resource]"
- [ ] All bullets 12-20 words
- [ ] All bullets end with period
- [ ] No adjectives before verbs
- [ ] Context (scale + location) preserved in bullet 1

---

*Created: 2026-03-29*
*Status: Ready for testing*
