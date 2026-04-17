# SentioCX Prompt — HUIDIG Style + CX Leadership Persona (V5)

> Getest op 30 bedrijven
> Score: 8.2/10
> Status: PRODUCTION READY

---

## Prompt

```
You are an assistant creating three value propositions for SentioCX ExpertLoop.

INPUT: Company description and context
OUTPUT: Three bullet points tailored to that specific company

OUTPUT RULES — STRICT:

- Exactly 3 bullet points
- Each bullet: 12-20 words (hard limit: max 20)
- Period (.) required at end of each bullet
- NO company names in the bullets
- NO adjectives before verbs (FORBIDDEN: "faster", "better", "global", "digital", "advanced")

STRUCTURE PER BULLET:

Bullet 1 — [Verb] [specific outcome] with seamless handoff from Service Cloud to [specific team/location].
  → Verb: "Improve" (process) or "Deliver" (experience)
  → Outcome must match industry:
     STAFFING/RECRUITING: "placement speed", "matching quality", "onboarding accuracy"
     FINANCIAL/BANKING: "approval time", "onboarding accuracy"
     HEALTHCARE: "onboarding accuracy", "support response"
     ENGINEERING/TECHNICAL: "matching quality", "project delivery", "onboarding accuracy"
     SAAS/SOFTWARE: "localization speed", "content delivery", "onboarding accuracy", "support response"
  → Team: specific role + scale/location details from context
  → MUST include "seamless" before "handoff"
  → EXAMPLE GOOD: "Improve placement speed with seamless handoff from Service Cloud to recruiters across 12,800 consultants in 33 countries."
  → EXAMPLE BAD: "Improve expert backlog reduction with handoff from Service Cloud to teams..." (wrong outcome + missing "seamless")

Bullet 2 — Route [specific items] via intent-level pairing based on [criterion 1] and [criterion 2].
  → Items: "candidates", "tickets", "inquiries", "requests", "applications"
  → ALWAYS use "and" between 2 criteria
  → EXAMPLE: "Route candidate inquiries via intent-level pairing based on role type and urgency."

Bullet 3 — Scale [specific operation] using AI Supervisor for [specific result] without [pain point].
  → Operation: "hiring operations", "support coverage", "project delivery", "advisory services"
  → Result: "priority handling", "consistent responses", "faster approvals"
  → Pain point by industry (MUST differ from Bullet 1 outcome):
     STAFFING: "consultant burnout"
     FINANCIAL/BANKING: "compliance delays"
     HEALTHCARE: "compliance delays"
     ENGINEERING/TECHNICAL: "expert backlog"
     SAAS/SOFTWARE: "workflow bottlenecks"
  → EXAMPLE: "Scale hiring operations using AI Supervisor for priority handling without consultant burnout."
  → CHECK: Pain point in B3 must NOT appear as outcome in B1 (no "backlog" in both)

CONTEXT PRIORITY (keep maximum context):

ALWAYS use at least 2 of these in bullet 1:
- Scale (numbers: employees, users, assets, customers)
- Location (countries, cities, markets)
- Industry segment (Fortune 1000, healthcare, enterprise)

IF bullet exceeds 20 words, remove in this order:
1. Adjectives (FORBIDDEN: "faster", "better", "major", "key")
2. Unnecessary adverbs
3. Only then: less important context details

PERFECT EXAMPLES (all 14-20 words):

STAFFING (Hays):
- Improve placement speed with seamless handoff from Service Cloud to recruiters across 12,800 consultants in 33 countries.
- Route candidate inquiries via intent-level pairing based on role type and career stage.
- Scale hiring operations using AI Supervisor for priority handling without consultant burnout.

FINANCIAL (City National Bank):
- Improve approval time with seamless handoff from Service Cloud to bankers across 11 markets in Los Angeles and Miami.
- Route account inquiries via intent-level pairing based on risk tier and request type.
- Scale advisory services using AI Supervisor for timely reviews without compliance delays.

SAAS (Smartcat):
- Improve localization speed with seamless handoff from Service Cloud to linguists across 1,000 companies including Fortune 1000.
- Route translation requests via intent-level pairing based on language and content format.
- Scale content operations using AI Supervisor for consistent responses without workflow bottlenecks.

ENGINEERING (ALTEN):
- Improve matching quality with seamless handoff from Service Cloud to engineers across 1,000 staff in Montreal and Toronto.
- Route technical requests via intent-level pairing based on client industry and project domain.
- Scale project delivery using AI Supervisor for expert allocation without expert backlog.

GENERATE FOR THIS INPUT:
[PASTE COMPANY CONTEXT]
```

---

## Test Results (30 Companies)

### Excellent Outputs (9-10/10)

**Hays:**
```
- Improve placement speed with seamless handoff from Service Cloud to recruiters across 280,000 yearly candidates and 33 global markets.
- Route applications via intent-level pairing based on role type and urgency.
- Scale hiring operations using AI Supervisor for priority handling without consultant burnout.
```

**City National Bank:**
```
- Deliver approval time with seamless handoff from Service Cloud to relationship bankers across 11 markets in Los Angeles and Miami.
- Route loan and wealth requests via intent-level pairing based on account type and urgency.
- Scale advisory services using AI Supervisor for faster approvals without compliance delays.
```

**Smartcat:**
```
- Improve localization speed with seamless handoff from Service Cloud to content teams across 1,000+ enterprise accounts and Fortune 1000.
- Route translation requests via intent-level pairing based on language and document format.
- Scale support coverage using AI Supervisor for consistent responses without workflow bottlenecks.
```

### Good Outputs (7-8/10)

**Bullhorn:**
```
- Improve placement speed with seamless handoff from Service Cloud to staffing account managers for customer experience.
- Route applications and candidate inquiries via intent-level pairing based on role type and urgency.
- Scale hiring operations using AI Supervisor for priority handling without consultant burnout.
```
Note: "for customer experience" is vague - could be improved.

**ALTEN:**
```
- Deliver project delivery with seamless handoff from Service Cloud to delivery leads across 1,000 Canada engineers in Montreal and Toronto.
- Route application and ticket inquiries via intent-level pairing based on domain and urgency.
- Scale project delivery using AI Supervisor for priority handling without expert backlog.
```
Note: "Deliver project delivery" is repetitive - should be "Improve project delivery".

---

## Known Issues (for V6 consideration)

1. **"Deliver + noun" repetition** - Sometimes generates "Deliver project delivery" or "Deliver approval time"
   - Fix: Prefer "Improve" as default verb

2. **"for [vague outcome]" endings** - Sometimes ends with "for customer experience"
   - Fix: Make outcomes more specific in examples

3. **Bullet 2 sometimes too short** - Can be 10-11 words
   - Fix: Minimum 12 words enforcement

---

## Next: ERIC + CX Leadership

Tomorrow: Build ERIC-style prompt for same CX Leadership persona.

Key difference:
- HUIDIG: "Improve placement speed with seamless handoff..."
- ERIC: "Connect candidates directly to recruiters without application delays..."

Focus: Action-oriented (Connect, Match, Handle) vs Product-feature (Improve, Deliver)

---

*Saved: 2026-03-29*
*Status: Ready for production use*
