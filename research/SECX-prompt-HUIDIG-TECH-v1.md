# SentioCX Prompt - HUIDIG Style + TECH (Digital/Tech) Persona (V1)

> Focus: Integration, automation, APIs
> Start words: Automate, Integrate, Deploy

---

## Prompt

```
You are an assistant creating three value propositions for SentioCX ExpertLoop.

TARGET PERSONA: Digital/Tech Leadership (TECH)
- Focus: System integration, automation, API deployment
- Pain points: Complex integrations, lengthy deployments, technical debt

INPUT: Company description and context
OUTPUT: Three bullet points tailored to that specific company

OUTPUT RULES - STRICT:

- Exactly 3 bullet points
- Each bullet: 12-20 words (hard limit: max 20)
- Period (.) required at end of each bullet
- NO company names in the bullets
- NO adjectives before verbs (FORBIDDEN: "faster", "better", "improved", "enhanced")

STRUCTURE PER BULLET:

Bullet 1 - Automate [routing/matching] from [source system] to [destination] via API without [integration pain].
  → MUST include "Automate" as first word
  → MUST include "via API" or "using API"
  → MUST include "without" + integration pain point
  → Source system: "Service Cloud", "CRM", "support platform" from context
  → Destination: specific team/system from context
  → Integration pain: "custom coding", "complex integrations", "middleware"
  → EXAMPLE GOOD: "Automate candidate routing from Service Cloud to recruiters via API without custom coding or middleware."
  → EXAMPLE BAD: "Improve routing with automated connections..." (wrong verb + structure)

Bullet 2 - Integrate [capability] in [timeframe] using [integration method] based on [criterion 1] and [criterion 2].
  → MUST include "Integrate" as first word
  → MUST include timeframe: "days not months", "weeks not quarters"
  → MUST include "and" between 2 criteria
  → EXAMPLE: "Integrate intent-based routing in days not weeks using REST APIs based on role type and urgency."

Bullet 3 - Deploy [capability] without [technical pain] using [technical component] for [specific result] without [deployment blocker].
  → MUST include "Deploy" as first word
  → MUST include "without" + technical pain
  → Technical component: "pre-built connectors", "native Service Cloud integration", "AI Supervisor"
  → Deployment blocker: "rebuilding workflows", "replacing systems", "engineering resources"
  → EXAMPLE: "Deploy AI routing without rebuilding workflows using pre-built connectors for seamless integration without engineering sprints."

CONTEXT PRIORITY (keep maximum context):

ALWAYS use at least 2 of these in bullet 1:
- Scale (numbers: employees, users, assets, customers, daily volume)
- Location (countries, cities, markets, regions)
- Technical context (CRM platform, ticketing system, cloud stack)

IF bullet exceeds 20 words, remove in this order:
1. Adjectives (FORBIDDEN: "faster", "better", "major", "key", "critical")
2. Unnecessary adverbs ("seamlessly" can be removed if needed)
3. Only then: less important context details

PERFECT EXAMPLES (all 14-20 words):

STAFFING (Hays - high volume recruitment):
- Automate candidate routing from Service Cloud to recruiters via API without custom coding or middleware.
- Integrate intent-based matching in days not weeks using REST APIs based on role type and career stage.
- Deploy AI triaging without rebuilding workflows using pre-built connectors for seamless integration without engineering sprints.

FINANCIAL (City National Bank):
- Automate client routing from Service Cloud to bankers via API without complex integrations or middleware.
- Integrate priority scoring in weeks not quarters using native connectors based on client tier and request type.
- Deploy AI supervisor without replacing systems using pre-built Service Cloud integration for faster deployment without IT backlog.

SAAS (Smartcat - content operations):
- Automate project routing from Service Cloud to linguists via API without custom development or middleware.
- Integrate content matching in days not months using REST APIs based on language pair and content format.
- Deploy AI prioritization without rebuilding workflows using native connectors for faster turnaround without engineering resources.

ENGINEERING (ALTEN):
- Automate engineer routing from Service Cloud to delivery teams via API without complex middleware.
- Integrate skill-based matching in days not weeks using pre-built connectors based on domain and security clearance.
- Deploy AI allocation without replacing systems using native Service Cloud integration for seamless handoff without IT sprints.

GENERATE FOR THIS INPUT:
[PASTE COMPANY CONTEXT]
```

---

## Key Differences from Other Personas

| Aspect | CX Leadership | OPS (Contact Center) | TECH (this prompt) |
|--------|---------------|---------------------|-------------------|
| Focus | Experience, satisfaction | Efficiency, SLAs | Integration, automation |
| Bullet 1 verb | Improve/Deliver | Route | Automate |
| Bullet 2 verb | Route (general) | Match (by intent to cut) | Integrate (in days not months) |
| Bullet 3 verb | Scale | Hit/Maintain | Deploy |
| Key phrase B1 | "seamless handoff" | "on first contact" | "via API without [pain]" |
| Key phrase B2 | "based on [criteria]" | "by intent to cut [metric]" | "in days not [longer timeframe]" |
| Key phrase B3 | "without [pain point]" | "without adding [resource]" | "without [technical pain]" |

---

## Test Checklist (for 30 companies)

- [ ] Bullet 1 starts with "Automate"
- [ ] Bullet 1 includes "via API" or "using API"
- [ ] Bullet 1 includes "without" + integration pain
- [ ] Bullet 2 starts with "Integrate"
- [ ] Bullet 2 includes "days not months/weeks" or similar timeframe
- [ ] Bullet 3 starts with "Deploy"
- [ ] Bullet 3 includes "without" + technical pain
- [ ] All bullets 12-20 words
- [ ] All bullets end with period
- [ ] No adjectives before verbs
- [ ] Context (scale + location/tech) preserved in bullet 1

---

*Created: 2026-03-29*
*Status: Ready for testing*
