"""
ICP & Persona Mapping Skill — GTM Strategy Framework Step 2

Per solution: determines which type companies have the pain (ICP segments)
and which buyer personas feel the pain / buy the solution.
Generates prioritization scores per potential campaign cell.

Hard Rule: NO generic language like "companies of your scale" or "teams your size".
ALWAYS concrete: "SaaS companies with Salesforce Service Cloud", "staffing firms with high placement pressure"
"""

import json
from dataclasses import dataclass, field
from typing import Optional


@dataclass
class FirmographicCriteria:
    """Hard criteria for ICP segment targeting"""
    company_size_range: str        # e.g. "50-500 employees"
    revenue_range: str             # e.g. "$5M-$100M ARR"
    geography: list[str]           # e.g. ["EMEA", "US"]
    industries: list[str]          # Specific industries
    tech_stack: list[str]          # Technographic signals


@dataclass
class ICPSegment:
    """Ideal Customer Profile segment — concrete company type"""
    segment_name: str
    company_type: str              # CONCRETE type (NO generic scale language)
    context_description: str       # What makes this type relevant
    hard_blocks: list[str]         # Hard disqualifiers
    trigger_events: list[str]      # Events that create urgency
    pain_indicators: list[str]     # Signals pain is present
    technographic_signals: list[str]
    firmographic_criteria: FirmographicCriteria


@dataclass
class PainAnalysis:
    """Multi-layer pain analysis for buyer persona"""
    operational: str               # Day-to-day pain
    strategic: str                 # Long-term impact
    personal: str                  # Personal consequences for buyer
    financial: str                 # Financial impact


@dataclass
class BuyerPersona:
    """Buyer persona within an ICP segment"""
    persona_name: str
    role_title: str
    department: str
    seniority_level: str           # C-level, VP, Director, Manager
    kpis: list[str]                # What they're measured on
    pain_analysis: PainAnalysis
    buying_behavior: str           # How they buy (risk-averse/data-driven/etc.)
    internal_political_motivation: str  # Why they want this internally


@dataclass
class CellPrioritizationScore:
    """Prioritization score for a campaign cell (solution × segment × persona)"""
    solution_name: str
    segment_name: str
    persona_name: str
    pain_intensity_score: int      # 1-5
    proof_fit_score: int           # 1-5
    trigger_strength_score: int    # 1-5
    market_size_score: int         # 1-5
    list_availability_score: int   # 1-5
    execution_ease_score: int      # 1-5
    priority_score: int            # Sum of above 6
    priority_reasoning: str        # Why this score
    recommended: bool              # Top 3 recommended cells


@dataclass
class ICPPersonaMappingResult:
    """Complete ICP & Persona mapping output"""
    client_code: str
    client_name: str
    segments_per_solution: dict[str, list[ICPSegment]]   # solution_name -> segments
    personas_per_solution: dict[str, list[BuyerPersona]]  # solution_name -> personas
    cell_scores: list[CellPrioritizationScore]            # All cells with scores
    top_recommended_cells: list[CellPrioritizationScore]  # Top 3 recommended


def get_icp_persona_prompt(client_data: dict, solutions: list[dict]) -> str:
    """
    Generate the prompt for Kimi K2.5 to perform ICP & Persona mapping.

    Args:
        client_data: Dict with client_code, client_name, company_info, etc.
        solutions: List of solution dicts from SOP 1 (offer development)

    Returns:
        Complete prompt for Kimi K2.5 analysis
    """
    solutions_json = json.dumps(solutions, indent=2)

    return f"""You are an expert B2B targeting strategist. Map ICP segments and buyer personas for this client.

CLIENT DATA:
```json
{json.dumps(client_data, indent=2)}
```

SOLUTIONS FROM SOP 1:
```json
{solutions_json}
```

YOUR TASK — SOP 2: ICP & PERSONA MAPPING

For EACH solution above, determine:

STEP 1: ICP SEGMENTS (max 3-4 per solution)
What CONCRETE types of companies have the pain this solution solves?

**HARD RULE — LANGUAGE:**
- FORBIDDEN: "companies of your scale", "teams your size", "businesses like yours"
- REQUIRED: Concrete company types — e.g., "SaaS companies with Salesforce Service Cloud", "staffing firms with 50+ recruiters", "manufacturers with SAP ERP and quality compliance requirements"

Per segment define:
- `segment_name` — Short descriptive name
- `company_type` — CONCRETE description (e.g., "B2B SaaS companies with complex implementations")
- `context_description` — Why this type specifically feels the pain
- `hard_blocks` — Disqualifiers (e.g., ["Has existing competitor contract", "Under 50 employees"])
- `trigger_events` — Events that make them buy NOW (e.g., ["New funding round", "Leadership change", "Compliance audit failure"])
- `pain_indicators` — Observable signals (e.g., ["Hiring spree for support roles", "Negative G2 reviews about onboarding"])
- `technographic_signals` — Tech stack clues (e.g., ["Uses Zendesk", "Salesforce Service Cloud visible on careers page"])
- `firmographic_criteria` — Hard filters:
  - `company_size_range`: "X-Y employees"
  - `revenue_range`: "$X-$Y ARR" or "$X-$Y revenue"
  - `geography`: ["EMEA", "US", "UKI", etc.]
  - `industries`: ["SaaS", "Manufacturing", "Healthcare", etc.]
  - `tech_stack`: ["Salesforce", "Zendesk", "Slack", etc.]

STEP 2: BUYER PERSONAS (max 2-3 per segment)
Within each segment, WHO feels the pain AND can buy?

Per persona define:
- `persona_name` — Memorable name (e.g., "The Overwhelmed Support Director")
- `role_title` — Actual job title
- `department` — Function/department
- `seniority_level` — C-level / VP / Director / Manager
- `kpis` — What they're measured on (e.g., ["First response time", "CSAT", "Team utilization"])
- `pain_analysis` — Four layers:
  - `operational`: Day-to-day pain (e.g., "Team drowning in ticket backlog")
  - `strategic`: Long-term impact (e.g., "Customer churn from poor support")
  - `personal`: Career consequences (e.g., "CEO questioning my leadership")
  - `financial`: Budget impact (e.g., "Overtime costs 40% over budget")
- `buying_behavior` — How they decide (e.g., "Risk-averse, needs case studies", "Data-driven, wants ROI proof")
- `internal_political_motivation` — Why they champion this (e.g., "Wants to look like digital transformation hero to CEO")

STEP 3: CELL PRIORITIZATION SCORING
For every solution × segment × persona combination, score on 1-5 scale:

- `pain_intensity_score` — How acute is the pain? (5 = bleeding neck, 1 = nice-to-have)
- `proof_fit_score` — How well can we prove we solve this? (5 = exact case study, 1 = theoretical)
- `trigger_strength_score` — How strong are the trigger events? (5 = frequent, observable, urgent)
- `market_size_score` — How many companies fit this cell? (5 = 10,000+, 1 = <100)
- `list_availability_score` — How reachable are they? (5 = Apollo lists available, 1 = impossible to find)
- `execution_ease_score` — How easy to execute? (5 = simple message, 1 = complex sale)

Calculate `priority_score` = sum of all 6 scores (max 30).
Mark `recommended: true` for top 3 highest-scoring cells.

OUTPUT FORMAT — Return valid JSON:
```json
{{
  "segments_per_solution": {{
    "Solution Name": [
      {{
        "segment_name": "Support-Heavy SaaS",
        "company_type": "B2B SaaS companies with 100+ support tickets/day and 10+ support staff",
        "context_description": "Fast-growing SaaS where support is becoming a bottleneck to expansion",
        "hard_blocks": ["Has existing competitor contract", "No budget owner identified"],
        "trigger_events": ["Recent funding round", "Support team hiring freeze despite ticket growth", "Negative Glassdoor reviews about support workload"],
        "pain_indicators": ["Job postings for 5+ support roles", "Public complaints about slow support on social media", "Zendesk visible on careers page"],
        "technographic_signals": ["Zendesk", "Intercom", "Salesforce Service Cloud"],
        "firmographic_criteria": {{
          "company_size_range": "50-500 employees",
          "revenue_range": "$5M-$100M ARR",
          "geography": ["EMEA", "US"],
          "industries": ["SaaS", "Software"],
          "tech_stack": ["Zendesk", "Intercom", "Slack"]
        }}
      }}
    ]
  }},
  "personas_per_solution": {{
    "Solution Name": [
      {{
        "persona_name": "The Overwhelmed Support Director",
        "role_title": "Director of Customer Support",
        "department": "Customer Success",
        "seniority_level": "Director",
        "kpis": ["First response time", "Ticket resolution time", "CSAT score", "Team utilization"],
        "pain_analysis": {{
          "operational": "Team is drowning in 150+ daily tickets, 48h backlog, agents working overtime",
          "strategic": "Support quality is blocking expansion into enterprise accounts, CEO demanding metrics improvement",
          "personal": "If metrics don't improve in Q2, my job is at risk; I'm already working 60h weeks",
          "financial": "Overtime costs 40% over budget, missing quarterly targets"
        }},
        "buying_behavior": "Risk-averse, needs peer case studies and proof of team efficiency gains",
        "internal_political_motivation": "Wants to present a 'digital transformation win' to CEO and avoid team burnout"
      }}
    ]
  }},
  "cell_scores": [
    {{
      "solution_name": "Solution Name",
      "segment_name": "Support-Heavy SaaS",
      "persona_name": "The Overwhelmed Support Director",
      "pain_intensity_score": 5,
      "proof_fit_score": 4,
      "trigger_strength_score": 4,
      "market_size_score": 4,
      "list_availability_score": 5,
      "execution_ease_score": 3,
      "priority_score": 25,
      "priority_reasoning": "High pain intensity with strong trigger events, good list availability via Apollo, proof exists but execution requires some education",
      "recommended": true
    }}
  ]
}}
```

RULES:
- MAX 3-4 segments per solution, MAX 2-3 personas per segment
- Company_type MUST be concrete — "SaaS with X" not "companies like yours"
- Pain must be specific and multi-layered (operational + strategic + personal + financial)
- Triggers must be observable events, not assumptions
- Scores must be justified in priority_reasoning
- Only top 3 cells get recommended: true
- All scores 1-5 scale, priority_score is sum (should be 6-30)
"""


def run_icp_persona_mapping(
    client_data: dict,
    solutions: list[dict]
) -> ICPPersonaMappingResult:
    """
    SOP 2: ICP & Persona Mapping

    Per solution: determine which company types and buyer personas are relevant.
    Generates prioritization scores per potential campaign cell.

    In production: calls Kimi K2.5 via CCR.
    For now: generates prompt + returns placeholder structure.

    Args:
        client_data: Dict with client_code, client_name, company_info
        solutions: List of solution dicts from SOP 1

    Returns:
        ICPPersonaMappingResult with segments, personas, and cell scores
    """
    client_code = client_data.get("client_code", "UNKNOWN")
    client_name = client_data.get("client_name", "Unknown Client")

    # Placeholder structure — in production this would be populated by Kimi K2.5
    return ICPPersonaMappingResult(
        client_code=client_code,
        client_name=client_name,
        segments_per_solution={},
        personas_per_solution={},
        cell_scores=[],
        top_recommended_cells=[]
    )


def _parse_segment(segment_data: dict) -> ICPSegment:
    """Parse segment dict into ICPSegment dataclass"""
    firmographic = FirmographicCriteria(
        company_size_range=segment_data.get("firmographic_criteria", {}).get("company_size_range", ""),
        revenue_range=segment_data.get("firmographic_criteria", {}).get("revenue_range", ""),
        geography=segment_data.get("firmographic_criteria", {}).get("geography", []),
        industries=segment_data.get("firmographic_criteria", {}).get("industries", []),
        tech_stack=segment_data.get("firmographic_criteria", {}).get("tech_stack", [])
    )

    return ICPSegment(
        segment_name=segment_data.get("segment_name", ""),
        company_type=segment_data.get("company_type", ""),
        context_description=segment_data.get("context_description", ""),
        hard_blocks=segment_data.get("hard_blocks", []),
        trigger_events=segment_data.get("trigger_events", []),
        pain_indicators=segment_data.get("pain_indicators", []),
        technographic_signals=segment_data.get("technographic_signals", []),
        firmographic_criteria=firmographic
    )


def _parse_persona(persona_data: dict) -> BuyerPersona:
    """Parse persona dict into BuyerPersona dataclass"""
    pain_analysis = PainAnalysis(
        operational=persona_data.get("pain_analysis", {}).get("operational", ""),
        strategic=persona_data.get("pain_analysis", {}).get("strategic", ""),
        personal=persona_data.get("pain_analysis", {}).get("personal", ""),
        financial=persona_data.get("pain_analysis", {}).get("financial", "")
    )

    return BuyerPersona(
        persona_name=persona_data.get("persona_name", ""),
        role_title=persona_data.get("role_title", ""),
        department=persona_data.get("department", ""),
        seniority_level=persona_data.get("seniority_level", ""),
        kpis=persona_data.get("kpis", []),
        pain_analysis=pain_analysis,
        buying_behavior=persona_data.get("buying_behavior", ""),
        internal_political_motivation=persona_data.get("internal_political_motivation", "")
    )


def parse_icp_persona_response(response_data: dict, client_code: str, client_name: str) -> ICPPersonaMappingResult:
    """
    Parse Kimi K2.5 JSON response into ICPPersonaMappingResult.

    Args:
        response_data: JSON dict from Kimi K2.5 response
        client_code: Client code
        client_name: Client name

    Returns:
        Populated ICPPersonaMappingResult
    """
    segments_per_solution = {}
    for solution_name, segments_data in response_data.get("segments_per_solution", {}).items():
        segments_per_solution[solution_name] = [
            _parse_segment(seg) for seg in segments_data
        ]

    personas_per_solution = {}
    for solution_name, personas_data in response_data.get("personas_per_solution", {}).items():
        personas_per_solution[solution_name] = [
            _parse_persona(per) for per in personas_data
        ]

    cell_scores = []
    for cell_data in response_data.get("cell_scores", []):
        cell = CellPrioritizationScore(
            solution_name=cell_data.get("solution_name", ""),
            segment_name=cell_data.get("segment_name", ""),
            persona_name=cell_data.get("persona_name", ""),
            pain_intensity_score=cell_data.get("pain_intensity_score", 0),
            proof_fit_score=cell_data.get("proof_fit_score", 0),
            trigger_strength_score=cell_data.get("trigger_strength_score", 0),
            market_size_score=cell_data.get("market_size_score", 0),
            list_availability_score=cell_data.get("list_availability_score", 0),
            execution_ease_score=cell_data.get("execution_ease_score", 0),
            priority_score=cell_data.get("priority_score", 0),
            priority_reasoning=cell_data.get("priority_reasoning", ""),
            recommended=cell_data.get("recommended", False)
        )
        cell_scores.append(cell)

    # Filter top recommended cells
    top_recommended_cells = [cell for cell in cell_scores if cell.recommended][:3]

    return ICPPersonaMappingResult(
        client_code=client_code,
        client_name=client_name,
        segments_per_solution=segments_per_solution,
        personas_per_solution=personas_per_solution,
        cell_scores=cell_scores,
        top_recommended_cells=top_recommended_cells
    )


def result_to_dict(result: ICPPersonaMappingResult) -> dict:
    """Convert result to dict for JSON serialization"""
    return {
        "client_code": result.client_code,
        "client_name": result.client_name,
        "segments_per_solution": {
            solution: [
                {
                    "segment_name": seg.segment_name,
                    "company_type": seg.company_type,
                    "context_description": seg.context_description,
                    "hard_blocks": seg.hard_blocks,
                    "trigger_events": seg.trigger_events,
                    "pain_indicators": seg.pain_indicators,
                    "technographic_signals": seg.technographic_signals,
                    "firmographic_criteria": {
                        "company_size_range": seg.firmographic_criteria.company_size_range,
                        "revenue_range": seg.firmographic_criteria.revenue_range,
                        "geography": seg.firmographic_criteria.geography,
                        "industries": seg.firmographic_criteria.industries,
                        "tech_stack": seg.firmographic_criteria.tech_stack,
                    }
                }
                for seg in segments
            ]
            for solution, segments in result.segments_per_solution.items()
        },
        "personas_per_solution": {
            solution: [
                {
                    "persona_name": per.persona_name,
                    "role_title": per.role_title,
                    "department": per.department,
                    "seniority_level": per.seniority_level,
                    "kpis": per.kpis,
                    "pain_analysis": {
                        "operational": per.pain_analysis.operational,
                        "strategic": per.pain_analysis.strategic,
                        "personal": per.pain_analysis.personal,
                        "financial": per.pain_analysis.financial,
                    },
                    "buying_behavior": per.buying_behavior,
                    "internal_political_motivation": per.internal_political_motivation,
                }
                for per in personas
            ]
            for solution, personas in result.personas_per_solution.items()
        },
        "cell_scores": [
            {
                "solution_name": cell.solution_name,
                "segment_name": cell.segment_name,
                "persona_name": cell.persona_name,
                "pain_intensity_score": cell.pain_intensity_score,
                "proof_fit_score": cell.proof_fit_score,
                "trigger_strength_score": cell.trigger_strength_score,
                "market_size_score": cell.market_size_score,
                "list_availability_score": cell.list_availability_score,
                "execution_ease_score": cell.execution_ease_score,
                "priority_score": cell.priority_score,
                "priority_reasoning": cell.priority_reasoning,
                "recommended": cell.recommended,
            }
            for cell in result.cell_scores
        ],
        "top_recommended_cells": [
            {
                "solution_name": cell.solution_name,
                "segment_name": cell.segment_name,
                "persona_name": cell.persona_name,
                "pain_intensity_score": cell.pain_intensity_score,
                "proof_fit_score": cell.proof_fit_score,
                "trigger_strength_score": cell.trigger_strength_score,
                "market_size_score": cell.market_size_score,
                "list_availability_score": cell.list_availability_score,
                "execution_ease_score": cell.execution_ease_score,
                "priority_score": cell.priority_score,
                "priority_reasoning": cell.priority_reasoning,
                "recommended": cell.recommended,
            }
            for cell in result.top_recommended_cells
        ],
    }


if __name__ == "__main__":
    # Test with sample data
    test_client = {
        "client_code": "SECX",
        "client_name": "SentioCX",
        "company_info": "AI-powered customer experience routing for support teams",
        "target_market": "B2B companies with complex support operations",
    }

    test_solutions = [
        {
            "solution_name": "AI Escalation Routing",
            "description": "Eliminates random escalations by routing complex cases to right agents",
            "primary_problem": "Support directors drowning in escalations",
            "problem_mechanism": "AI analyzes case complexity and agent expertise for optimal routing",
        },
        {
            "solution_name": "Agent Performance Optimization",
            "description": "Matches cases to agents based on expertise and past performance",
            "primary_problem": "Low first-contact resolution rates",
            "problem_mechanism": "Predictive matching ensures experts handle complex cases",
        }
    ]

    # Generate prompt
    prompt = get_icp_persona_prompt(test_client, test_solutions)
    print("=" * 60)
    print("GENERATED PROMPT (first 1000 chars)")
    print("=" * 60)
    print(prompt[:1000] + "...")
    print()

    # Run mapping (placeholder)
    result = run_icp_persona_mapping(test_client, test_solutions)
    print("=" * 60)
    print("ICP & PERSONA MAPPING RESULT (placeholder)")
    print("=" * 60)
    print(json.dumps(result_to_dict(result), indent=2))
