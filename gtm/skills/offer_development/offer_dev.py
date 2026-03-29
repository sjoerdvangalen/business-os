"""
Offer Development Skill — GTM Strategy Framework Step 1

Transforms client onboarding data into a validated, tier-classified offer
with front-end value props optimized for cold traffic.

Based on Christian's Outbound Content framework:
- 4 Offer Tiers: Difficult, Decent, Good, Incredible
- 3 Offer Types: Sales Asset, Front-End Offer, Free Trial/Sample
- Core principle: Cold traffic needs immediate, low-risk value
"""

import os
import json
from dataclasses import dataclass, field
from typing import Optional
from enum import Enum


class OfferTier(Enum):
    """
    4 tiers based on market difficulty and conversion rates.
    From Christian's framework.
    """
    DIFFICULT = "difficult"      # 1 lead per 1,000-10,000 contacts (SEO, cybersec, recruiting)
    DECENT = "decent"            # 1 lead per 500-1,000 contacts (email marketing, ad creative)
    GOOD = "good"                # 1 lead per 200-500 contacts (TikTok shop, niche SaaS)
    INCREDIBLE = "incredible"    # 1 lead per 25-200 contacts (blue ocean, unique)


class OfferType(Enum):
    """
    3 types of offers for cold traffic.
    """
    SALES_ASSET = "sales_asset"           # Case study, playbook, white paper
    FRONT_END_OFFER = "front_end_offer"   # Low-barrier paid (audit, small project)
    FREE_SAMPLE = "free_sample"           # Free trial, sample, done-for-you preview


@dataclass
class ValueProp:
    """Value proposition per persona"""
    persona: str
    core_prop: str                      # Max 15 words
    proof_point: str                    # Metric or case
    differentiator: str                 # Vs alternatives
    quantified_outcome: str             # Specific ROI/timeline


@dataclass
class FrontEndOffer:
    """Low-barrier offer for cold traffic"""
    offer_type: OfferType
    name: str                           # e.g., "Escalation Audit"
    description: str                    # What it is
    deliverable: str                    # What they get
    time_to_value: str                  # e.g., "24 hours", "2 weeks"
    cta: str                            # Soft CTA text
    risk_reversal: str                  # e.g., "No commitment needed"


@dataclass
class OfferDevelopmentResult:
    """Complete offer development output"""
    client_code: str
    client_name: str

    # Primary offer
    primary_offer: str                  # Main service/product
    primary_offer_description: str

    # Tier classification
    offer_tier: OfferTier
    tier_rationale: str                 # Why this tier
    estimated_conversion_rate: str      # e.g., "1 per 500 contacts"

    # Front-end offer for cold traffic
    front_end_offer: FrontEndOffer

    # Problem statements
    primary_problem: str                # The pain we solve
    problem_mechanism: str              # How we solve it (believable)

    # Messaging guidance
    script_length_guidance: str         # Based on tier
    needs_social_proof: bool            # Based on tier
    personalization_approach: str        # Based on tier

    # Value props per persona (filled later)
    value_props: list[ValueProp] = field(default_factory=list)


def get_offer_prompt(client_data: dict) -> str:
    """
    Generate the prompt for Kimi K2.5 to develop the offer.
    """
    return f"""You are an expert B2B offer strategist. Analyze this client and develop a complete offer strategy.

CLIENT DATA:
```json
{json.dumps(client_data, indent=2)}
```

YOUR TASK:
Analyze this client and classify their offer into ONE of these 4 tiers:

**DIFFICULT** — 1 lead per 1,000-10,000 contacts
- Examples: SEO, cybersecurity, recruiting, generic agency services
- Market is saturated or demand-capture only (people buy only when desperate)
- Requires hyper-specific personalization and strong front-end offer

**DECENT** — 1 lead per 500-1,000 contacts
- Examples: Email marketing, ad creative, cold email services
- Real demand but higher bar than before
- Benefits from front-end offer

**GOOD** — 1 lead per 200-500 contacts
- Examples: TikTok Shop, influencer marketing, niche SaaS
- Market actively wants this
- Can pitch directly, minimal front-end needed

**INCREDIBLE** — 1 lead per 25-200 contacts
- Examples: Unique/blue ocean, first-mover advantage
- One of handful globally offering this
- Hard to mess up even with mediocre copy

THEN — regardless of tier — design a FRONT-END OFFER:

This is what you actually lead with in cold outreach. It must be:
1. IMMEDIATE — value delivered now, not after a discovery call
2. LOW RISK — easy to say yes, hard to say no
3. SPECIFIC — concrete deliverable, not vague "let's chat"

Choose ONE type:
- **Sales Asset**: Share a case study deck, playbook, white paper
- **Front-End Offer**: Small paid engagement (audit, $500 project)
- **Free Sample**: Do part of the work for free (5 email openers, free audit)

OUTPUT FORMAT — Return valid JSON:
```json
{{
  "offer_tier": "decent|good|incredible|difficult",
  "tier_rationale": "2-3 sentences explaining why",
  "estimated_conversion_rate": "1 per X contacts",

  "primary_offer": "Main service/product name",
  "primary_offer_description": "What they actually sell",
  "primary_problem": "Specific pain they solve (1 sentence)",
  "problem_mechanism": "How they solve it, believably (1-2 sentences)",

  "front_end_offer": {{
    "offer_type": "sales_asset|front_end_offer|free_sample",
    "name": "Name of the front-end offer",
    "description": "What it is",
    "deliverable": "Exactly what they get",
    "time_to_value": "How fast (e.g., '24 hours', 'immediately')",
    "cta": "Soft CTA (e.g., 'Worth a quick look?')",
    "risk_reversal": "What removes risk (e.g., 'No commitment needed')"
  }},

  "script_guidance": {{
    "length_recommendation": "Under 45 words|45-70 words|Up to 150 words",
    "social_proof_strategy": "Minimal|Specific adjacent|Strong emphasis",
    "pain_point_specificity": "Hyper-specific|Moderate|Broad OK",
    "front_end_required": true|false
  }}
}}
```

RULES:
- Be honest about tier classification (most offers are Decent or Difficult)
- Front-end offer must feel like a gift, not a pitch in disguise
- Primary problem must be named specifically (not "they need growth")
- Mechanism must explain HOW (not just "we're the best")
"""


def analyze_offer_tier(client_data: dict) -> OfferDevelopmentResult:
    """
    Use Kimi K2.5 to analyze the offer and determine tier + front-end strategy.

    In production, this would call the Kimi API via CCR.
    For now, returns a structured result for testing.
    """
    # TODO: Integrate with Kimi K2.5 via CCR
    # For now, return a template structure

    client_code = client_data.get("client_code", "UNKNOWN")
    client_name = client_data.get("client_name", "Unknown Client")

    # Default/placeholder result
    return OfferDevelopmentResult(
        client_code=client_code,
        client_name=client_name,
        primary_offer=client_data.get("product_service", ""),
        primary_offer_description="",
        offer_tier=OfferTier.DECENT,  # Default assumption
        tier_rationale="Placeholder - requires Kimi analysis",
        estimated_conversion_rate="1 per 500 contacts",
        front_end_offer=FrontEndOffer(
            offer_type=OfferType.FREE_SAMPLE,
            name="[To be determined by AI analysis]",
            description="",
            deliverable="",
            time_to_value="",
            cta="",
            risk_reversal=""
        ),
        primary_problem="",
        problem_mechanism="",
        script_length_guidance="Under 70 words",
        needs_social_proof=True,
        personalization_approach="Problem-solution specificity",
        value_props=[]
    )


def develop_front_end_offer(offer_tier: OfferTier, client_data: dict) -> FrontEndOffer:
    """
    Recommend the optimal front-end offer based on tier.
    """
    if offer_tier == OfferTier.DIFFICULT:
        # Difficult offers need strong free value
        return FrontEndOffer(
            offer_type=OfferType.FREE_SAMPLE,
            name="Free Value-First Sample",
            description="Done-for-you preview of the service",
            deliverable="Specific deliverable based on their situation",
            time_to_value="24-48 hours",
            cta="Worth a quick look?",
            risk_reversal="No commitment, no call required"
        )
    elif offer_tier == OfferTier.DECENT:
        # Decent offers benefit from free sample or low-cost audit
        return FrontEndOffer(
            offer_type=OfferType.SALES_ASSET,
            name="Strategic Asset Share",
            description="Playbook or teardown based on real data",
            deliverable="PDF + Loom walkthrough",
            time_to_value="Immediately",
            cta="Want me to send it over?",
            risk_reversal="Just value, no pitch attached"
        )
    elif offer_tier == OfferTier.GOOD:
        # Good offers can use sales asset or light front-end
        return FrontEndOffer(
            offer_type=OfferType.SALES_ASSET,
            name="Peer Benchmark/Playbook",
            description="What's working for similar companies",
            deliverable="Industry-specific breakdown",
            time_to_value="Immediately",
            cta="Interested in the breakdown?",
            risk_reversal="No follow-up unless you want it"
        )
    else:  # INCREDIBLE
        # Incredible offers can pitch directly
        return FrontEndOffer(
            offer_type=OfferType.FRONT_END_OFFER,
            name="Direct Value Pitch",
            description="The core offer is strong enough",
            deliverable="Core service description",
            time_to_value="Varies",
            cta="Worth exploring?",
            risk_reversal="Low commitment trial available"
        )


def develop_value_props(
    result: OfferDevelopmentResult,
    personas: list[dict]
) -> list[ValueProp]:
    """
    Develop value props for each persona.
    Called after initial offer analysis.
    """
    value_props = []

    for persona in personas:
        vp = ValueProp(
            persona=persona.get("name", "Unknown"),
            core_prop="[To be generated by AI]",
            proof_point="[Metric or case reference]",
            differentiator="[Why us vs alternatives]",
            quantified_outcome="[Specific ROI/timeframe]"
        )
        value_props.append(vp)

    result.value_props = value_props
    return value_props


def run_offer_development(
    client_data: dict,
    personas: Optional[list[dict]] = None
) -> OfferDevelopmentResult:
    """
    Main entry point for Offer Development skill.

    Args:
        client_data: Dict with client_code, client_name, product_service, etc.
        personas: Optional list of persona dicts (can be added later)

    Returns:
        OfferDevelopmentResult with complete offer strategy
    """
    # Step 1: Analyze and classify offer
    result = analyze_offer_tier(client_data)

    # Step 2: Develop front-end offer based on tier
    result.front_end_offer = develop_front_end_offer(
        result.offer_tier,
        client_data
    )

    # Step 3: If personas provided, develop value props
    if personas:
        develop_value_props(result, personas)

    return result


def result_to_dict(result: OfferDevelopmentResult) -> dict:
    """Convert result to dict for JSON serialization"""
    return {
        "client_code": result.client_code,
        "client_name": result.client_name,
        "primary_offer": result.primary_offer,
        "primary_offer_description": result.primary_offer_description,
        "offer_tier": result.offer_tier.value,
        "tier_rationale": result.tier_rationale,
        "estimated_conversion_rate": result.estimated_conversion_rate,
        "front_end_offer": {
            "offer_type": result.front_end_offer.offer_type.value,
            "name": result.front_end_offer.name,
            "description": result.front_end_offer.description,
            "deliverable": result.front_end_offer.deliverable,
            "time_to_value": result.front_end_offer.time_to_value,
            "cta": result.front_end_offer.cta,
            "risk_reversal": result.front_end_offer.risk_reversal,
        },
        "primary_problem": result.primary_problem,
        "problem_mechanism": result.problem_mechanism,
        "value_props": [
            {
                "persona": vp.persona,
                "core_prop": vp.core_prop,
                "proof_point": vp.proof_point,
                "differentiator": vp.differentiator,
                "quantified_outcome": vp.quantified_outcome,
            }
            for vp in result.value_props
        ],
        "script_guidance": {
            "length_recommendation": result.script_length_guidance,
            "needs_social_proof": result.needs_social_proof,
            "personalization_approach": result.personalization_approach,
        }
    }


if __name__ == "__main__":
    # Test with sample data
    test_client = {
        "client_code": "SECX",
        "client_name": "SentioCX",
        "product_service": "AI-powered customer experience routing",
        "description": "Eliminates random escalations by routing complex cases based on impact and expertise",
        "key_metrics": ["60%+ first-contact resolution", "76% reduction in supervisor interventions"],
        "typical_deal_size": "$50k-100k ARR",
        "sales_cycle": "3-6 months",
        "target_market": "B2B SaaS companies with 50-500 employees",
        "competition": "Traditional workforce management tools",
    }

    result = run_offer_development(test_client)

    print("=" * 60)
    print("OFFER DEVELOPMENT RESULT")
    print("=" * 60)
    print(json.dumps(result_to_dict(result), indent=2))
