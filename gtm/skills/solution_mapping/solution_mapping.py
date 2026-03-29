"""
Solution Mapping Skill — GTM Strategy Framework SOP 1

Analyzes client onboarding data to detect all solutions in their portfolio.
Maps pain points, use case contexts, entry offers, and proof assets per solution.

Core principle: Pain-first mapping — identify problems before prescribing solutions.
Output: Complete solution inventory with commercial positioning.
"""

import json
from dataclasses import dataclass, field
from typing import Optional
from enum import Enum


class PainIntensity(Enum):
    HIGH = "high"
    MEDIUM = "medium"
    LOW = "low"


class PainUrgency(Enum):
    TRIGGER_BASED = "trigger-based"
    CHRONIC = "chronic"
    LATENT = "latent"


class OfferType(Enum):
    DIAGNOSE = "diagnose"
    PROOF_SEND = "proof_send"
    PILOT = "pilot"
    BENCHMARK = "benchmark"
    CHECKLIST = "checklist"
    SAMPLE = "sample"


class ProofLevel(Enum):
    VERIFIED = "verified"
    DIRECTIONAL = "directional"
    HYPOTHESIS_ONLY = "hypothesis_only"


class SendMode(Enum):
    SENDABLE = "sendable"
    MENTION_ONLY = "mention_only"
    INTERNAL_ONLY = "internal_only"


@dataclass
class PainPoint:
    pain: str
    intensity: PainIntensity
    urgency: PainUrgency


@dataclass
class BestFitContext:
    context: str
    why_fits: str


@dataclass
class EntryOfferCandidate:
    offer_name: str
    offer_type: OfferType
    deliverable_type: str
    friction_estimate: str


@dataclass
class ProofAssetCandidate:
    asset_name: str
    asset_type: str
    proof_level: ProofLevel
    send_mode: SendMode


@dataclass
class Solution:
    solution_name: str
    commercial_label: str
    core_problem: str
    dream_outcome: str
    pain_points: list[PainPoint] = field(default_factory=list)
    best_fit_contexts: list[BestFitContext] = field(default_factory=list)
    entry_offer_candidates: list[EntryOfferCandidate] = field(default_factory=list)
    proof_asset_candidates: list[ProofAssetCandidate] = field(default_factory=list)


@dataclass
class SolutionMappingResult:
    client_code: str
    client_name: str
    solutions: list[Solution] = field(default_factory=list)
    solution_count_rationale: str = ""
    recommended_priority: list[str] = field(default_factory=list)


def get_solution_mapping_prompt(client_data: dict) -> str:
    """Generate the prompt for Kimi K2.5 to map client solutions."""
    return f"""You are an expert B2B solution strategist. Analyze this client's complete product/service portfolio and map every distinct solution they offer.

CLIENT DATA:
```json
{json.dumps(client_data, indent=2)}
```

YOUR TASK:
Analyze the client's full offering and detect ALL distinct solutions. A "solution" is a specific problem-solution pairing with:
- Clear problem it solves
- Distinct outcome it delivers
- Specific contexts where it fits best

IMPORTANT: Do NOT assume exactly 5 solutions. Detect the actual number:
- A SaaS platform might have 2-3 solutions (e.g., "routing", "churn reduction", "onboarding analytics")
- A service business might have 2-4 solutions (e.g., "strategy consulting", "done-for-you execution", "training")
- An agency might have 3-6+ solutions across different service lines

FOR EACH SOLUTION, MAP:

1. **Core Identity**
   - `solution_name`: Internal name (e.g., "escalation_routing", "churn_analytics")
   - `commercial_label`: External name for prospects (e.g., "Smart Escalation Routing")
   - `core_problem`: What specific problem does this solve? (1 sentence, concrete)
   - `dream_outcome`: What does the client want to achieve? (aspirational but specific)

2. **Pain Points** (3-5 per solution)
   Pain-first mapping: identify the pains before contexts
   - `pain`: Specific pain statement (1 sentence)
   - `intensity`: high/medium/low
   - `urgency`: trigger-based/chronic/latent

   Intensity: How much does this hurt?
   Urgency: When do they act on it?
   - trigger-based: specific event triggers action (funding round, compliance deadline, team expansion)
   - chronic: ongoing pain they live with (inefficiency, missed opportunities)
   - latent: not actively felt until pointed out

3. **Best Fit Contexts** (3-5 per solution)
   Use case contexts — NOT company typifications (those go in ICP segments).
   Focus on situations, scenarios, or operational contexts where this solution shines.

   Examples of GOOD contexts:
   - "Company just raised Series A and is scaling CS team"
   - "Support team drowning in tickets with no triage system"
   - "New compliance requirement requiring audit trails"

   Examples of BAD contexts (these are ICP segments, not contexts):
   - "Companies of your scale"
   - "Teams of your size"
   - "B2B SaaS companies"

   For each context:
   - `context`: The situation/scenario
   - `why_fits`: Why this context is a good fit for this solution

4. **Entry Offer Candidates** (2-4 per solution)
   Possible front-end offers to lead with:
   - `offer_name`: Name of the offer
   - `offer_type`: diagnose/proof_send/pilot/benchmark/checklist/sample
   - `deliverable_type`: What exactly do they get?
   - `friction_estimate`: low/medium/high

5. **Proof Asset Candidates** (2-4 per solution)
   Evidence that supports this solution:
   - `asset_name`: Name of the asset
   - `asset_type`: case_study/testimonial/benchmark/internal_data/concept_note
   - `proof_level`: verified/directional/hypothesis_only
   - `send_mode`: sendable/mention_only/internal_only

FINALLY: Recommend priority order
List solution_names in order of:
1. Easiest to sell (clear problem, strong proof, defined context)
2. Highest revenue potential
3. Best market timing

OUTPUT FORMAT — Return valid JSON:
```json
{{
  "solution_count_rationale": "Why this number of solutions (e.g., 'Client has 3 distinct products: routing platform, analytics module, and consulting service')",
  "solutions": [
    {{
      "solution_name": "internal_name",
      "commercial_label": "Name Prospects See",
      "core_problem": "Specific problem this solves",
      "dream_outcome": "What they want to achieve",
      "pain_points": [
        {{"pain": "Specific pain statement", "intensity": "high|medium|low", "urgency": "trigger-based|chronic|latent"}}
      ],
      "best_fit_contexts": [
        {{"context": "Specific situation where this fits", "why_fits": "Why this context works"}}
      ],
      "entry_offer_candidates": [
        {{"offer_name": "...", "offer_type": "diagnose|proof_send|pilot|benchmark|checklist|sample", "deliverable_type": "...", "friction_estimate": "low|medium|high"}}
      ],
      "proof_asset_candidates": [
        {{"asset_name": "...", "asset_type": "case_study|testimonial|benchmark|internal_data|concept_note", "proof_level": "verified|directional|hypothesis_only", "send_mode": "sendable|mention_only|internal_only"}}
      ]
    }}
  ],
  "recommended_priority": ["solution_name_1", "solution_name_2", "solution_name_3"]
}}
```

CRITICAL RULES:
1. NEVER use generic contexts like "companies of your scale" or "teams of your size" — always specific situational contexts
2. Pain-first: map pains before contexts, not the other way around
3. Be honest about proof level — if no case study exists, mark as hypothesis_only
4. Each solution must have at least 3 pain points and 3 contexts
5. Recommended priority must include ALL solutions, not just top 3
"""


def parse_solution_from_dict(data: dict) -> Solution:
    """Parse a solution from JSON/dict format."""
    pain_points = [
        PainPoint(
            pain=p.get("pain", ""),
            intensity=PainIntensity(p.get("intensity", "medium")),
            urgency=PainUrgency(p.get("urgency", "chronic"))
        )
        for p in data.get("pain_points", [])
    ]

    contexts = [
        BestFitContext(
            context=c.get("context", ""),
            why_fits=c.get("why_fits", "")
        )
        for c in data.get("best_fit_contexts", [])
    ]

    entry_offers = [
        EntryOfferCandidate(
            offer_name=e.get("offer_name", ""),
            offer_type=OfferType(e.get("offer_type", "diagnose")),
            deliverable_type=e.get("deliverable_type", ""),
            friction_estimate=e.get("friction_estimate", "medium")
        )
        for e in data.get("entry_offer_candidates", [])
    ]

    proof_assets = [
        ProofAssetCandidate(
            asset_name=a.get("asset_name", ""),
            asset_type=a.get("asset_type", ""),
            proof_level=ProofLevel(a.get("proof_level", "hypothesis_only")),
            send_mode=SendMode(a.get("send_mode", "internal_only"))
        )
        for a in data.get("proof_asset_candidates", [])
    ]

    return Solution(
        solution_name=data.get("solution_name", ""),
        commercial_label=data.get("commercial_label", ""),
        core_problem=data.get("core_problem", ""),
        dream_outcome=data.get("dream_outcome", ""),
        pain_points=pain_points,
        best_fit_contexts=contexts,
        entry_offer_candidates=entry_offers,
        proof_asset_candidates=proof_assets
    )


def run_solution_mapping(client_data: dict) -> SolutionMappingResult:
    """
    SOP 1: Solution Mapping

    Analyzes client onboarding data and detects all solutions
    with pain points, fit contexts, entry offers and proof assets.

    In production: calls Kimi K2.5 via CCR.
    For now: generates prompt + returns placeholder structure.
    """
    client_code = client_data.get("client_code", "UNKNOWN")
    client_name = client_data.get("client_name", "Unknown Client")

    # Create placeholder structure
    # In production, this would call Kimi K2.5 and parse the response

    placeholder_solution = Solution(
        solution_name="[To be determined by AI analysis]",
        commercial_label="",
        core_problem="",
        dream_outcome="",
        pain_points=[],
        best_fit_contexts=[],
        entry_offer_candidates=[],
        proof_asset_candidates=[]
    )

    return SolutionMappingResult(
        client_code=client_code,
        client_name=client_name,
        solutions=[placeholder_solution],
        solution_count_rationale="Placeholder - requires Kimi analysis",
        recommended_priority=[]
    )


def result_to_dict(result: SolutionMappingResult) -> dict:
    """Convert result to dict for JSON serialization."""
    return {
        "client_code": result.client_code,
        "client_name": result.client_name,
        "solution_count_rationale": result.solution_count_rationale,
        "solutions": [
            {
                "solution_name": s.solution_name,
                "commercial_label": s.commercial_label,
                "core_problem": s.core_problem,
                "dream_outcome": s.dream_outcome,
                "pain_points": [
                    {
                        "pain": p.pain,
                        "intensity": p.intensity.value,
                        "urgency": p.urgency.value
                    }
                    for p in s.pain_points
                ],
                "best_fit_contexts": [
                    {
                        "context": c.context,
                        "why_fits": c.why_fits
                    }
                    for c in s.best_fit_contexts
                ],
                "entry_offer_candidates": [
                    {
                        "offer_name": e.offer_name,
                        "offer_type": e.offer_type.value,
                        "deliverable_type": e.deliverable_type,
                        "friction_estimate": e.friction_estimate
                    }
                    for e in s.entry_offer_candidates
                ],
                "proof_asset_candidates": [
                    {
                        "asset_name": a.asset_name,
                        "asset_type": a.asset_type,
                        "proof_level": a.proof_level.value,
                        "send_mode": a.send_mode.value
                    }
                    for a in s.proof_asset_candidates
                ]
            }
            for s in result.solutions
        ],
        "recommended_priority": result.recommended_priority
    }


if __name__ == "__main__":
    # Test with sample data
    test_client = {
        "client_code": "SECX",
        "client_name": "SentioCX",
        "product_service": "AI-powered customer experience platform",
        "description": "Platform with routing, analytics, and escalation management modules",
        "key_modules": [
            "Smart escalation routing",
            "Real-time analytics dashboard",
            "Agent performance scoring",
            "Churn prediction alerts"
        ],
        "target_use_cases": [
            "High-volume support teams drowning in tickets",
            "Companies scaling CS operations post-funding",
            "Support leaders wanting to reduce escalations"
        ],
        "proof_points": [
            "60%+ first-contact resolution improvement",
            "76% reduction in supervisor interventions",
            "Case study with major telecom"
        ]
    }

    # Generate and show the prompt
    prompt = get_solution_mapping_prompt(test_client)

    print("=" * 70)
    print("SOLUTION MAPPING PROMPT")
    print("=" * 70)
    print(prompt)
    print("\n")

    # Show placeholder result structure
    result = run_solution_mapping(test_client)

    print("=" * 70)
    print("PLACEHOLDER RESULT STRUCTURE")
    print("=" * 70)
    print(json.dumps(result_to_dict(result), indent=2))
