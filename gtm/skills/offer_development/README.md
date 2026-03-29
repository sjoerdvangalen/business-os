# Offer Development Skill

## Purpose

Transform client onboarding data into a validated, tier-classified offer optimized for cold traffic.

This is **Step 1** of the GTM Strategy Framework. The offer determines everything else: messaging approach, list building strategy, and campaign structure.

## The 4 Offer Tiers

| Tier | Conversion Rate | Examples | Approach |
|------|----------------|----------|----------|
| **Difficult** | 1 per 1K-10K | SEO, cybersecurity, recruiting | Needs strong free offer, hyper-specific personalization |
| **Decent** | 1 per 500-1K | Email marketing, ad creative | Benefits from front-end offer |
| **Good** | 1 per 200-500 | TikTok Shop, niche SaaS | Can pitch directly |
| **Incredible** | 1 per 25-200 | Blue ocean, unique | Offer does the heavy lifting |

## The 3 Offer Types for Cold Traffic

1. **Sales Asset** — Share a case study, playbook, or teardown
2. **Front-End Offer** — Low-barrier paid engagement (audit, $500 project)
3. **Free Sample** — Do part of the work for free

## Usage

```python
from skills.offer_development import run_offer_development, result_to_dict

client_data = {
    "client_code": "SECX",
    "client_name": "SentioCX",
    "product_service": "AI-powered customer experience routing",
    "description": "Eliminates random escalations...",
    "key_metrics": ["60%+ first-contact resolution"],
}

result = run_offer_development(client_data)
output = result_to_dict(result)

print(output["offer_tier"])  # "decent"
print(output["front_end_offer"]["name"])  # "Escalation Audit"
```

## Output Structure

```json
{
  "client_code": "SECX",
  "offer_tier": "good",
  "tier_rationale": "...",
  "estimated_conversion_rate": "1 per 300 contacts",
  "primary_offer": "AI-powered CX routing",
  "primary_problem": "Supervisors drowning in escalations",
  "problem_mechanism": "AI routes by impact + expertise, not queue order",
  "front_end_offer": {
    "offer_type": "free_sample",
    "name": "Escalation Audit",
    "deliverable": "5-point audit of their escalation patterns",
    "time_to_value": "24 hours",
    "cta": "Worth a quick look?",
    "risk_reversal": "No commitment needed"
  },
  "script_guidance": {
    "length_recommendation": "Under 70 words",
    "needs_social_proof": true,
    "personalization_approach": "Problem-solution specificity"
  }
}
```

## Key Principles

1. **Cold traffic needs immediate value** — Not a promise of future value
2. **Name the specific problem** — Not "they need growth"
3. **Explain the mechanism** — How you solve it, believably
4. **Make saying yes easy** — Low friction, no discovery call required

## Integration with Orchestrator

This skill is called first in the GTM flow. Its outputs feed into:
- Messaging Development (script angles)
- ICP Definition (who has this pain)
- Campaign Setup (offer in PlusVibe)
