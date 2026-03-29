"""
Campaign Cell Design Skill — GTM Strategy Framework SOP 3

Transforms approved solution × segment × persona combinations into
complete campaign cell briefs with hook themes, viability thresholds,
and launch prioritization.
"""

import json
import re
from dataclasses import dataclass
from typing import Optional
from enum import Enum


class OfferTier(Enum):
    """4 tiers based on market difficulty and conversion rates"""
    DIFFICULT = "difficult"      # 1 per 1000-10000
    DECENT = "decent"            # 1 per 500-1000
    GOOD = "good"                # 1 per 200-500
    INCREDIBLE = "incredible"    # 1 per 25-200


class TestPhase(Enum):
    """Test phases in campaign lifecycle"""
    H1 = "H1"
    F1 = "F1"
    CTA1 = "CTA1"
    MC1 = "MC1"
    SCALE = "SCALE"


@dataclass
class HookTheme:
    """Hook theme category (not copy)"""
    theme_name: str
    theme_category: str  # pain_consequence, trigger_event, missed_outcome, cost_revelation, status_quo_challenge
    description: str


@dataclass
class ViableCellThreshold:
    """Calculated viability for a cell"""
    estimated_prr: float
    offer_tier: str
    reply_to_meeting_rate: float
    meeting_to_close_rate: float
    deals_needed: int
    minimum_accounts_needed: int
    reasoning: str


@dataclass
class CampaignCellBrief:
    """Complete campaign cell brief (DOC 3 foundation)"""
    # Identity
    cell_code: str
    cell_slug: str
    client_code: str
    solution_name: str
    segment_name: str
    primary_persona_name: str
    entry_offer_name: str
    language: str
    region: str
    # Strategy
    hard_blocks: list[str]
    trigger_events: list[str]
    primary_pain: str
    secondary_pains: list[str]
    metric_under_pressure: str
    proof_asset_name: Optional[str]
    why_now: str
    disqualifiers: list[str]
    secondary_awareness_stage: str
    # Hook themes (categories, no copy)
    hook_themes: list[HookTheme]
    # Prioritization
    priority_score: int
    priority_reasoning: str
    # Viability
    viable_threshold: ViableCellThreshold
    # Test plan
    recommended_h1_sample_size: int
    recommended_start_phase: TestPhase


@dataclass
class CampaignCellDesignResult:
    """Complete SOP 3 output"""
    client_code: str
    client_name: str
    campaign_cells: list[CampaignCellBrief]
    total_cells_generated: int
    recommended_launch_order: list[str]


def get_tier_prr(tier: OfferTier) -> float:
    """Get default PRR for offer tier"""
    return {OfferTier.DIFFICULT: 0.005, OfferTier.DECENT: 0.015,
            OfferTier.GOOD: 0.025, OfferTier.INCREDIBLE: 0.04}.get(tier, 0.015)


def calculate_viable_cell_threshold(
    offer_tier: OfferTier, deals_needed: int = 2,
    reply_to_meeting: float = 0.20, meeting_to_close: float = 0.25
) -> ViableCellThreshold:
    """Calculate minimum accounts needed for viable cell."""
    estimated_prr = get_tier_prr(offer_tier)
    conversion_rate = estimated_prr * reply_to_meeting * meeting_to_close
    minimum_accounts = int(deals_needed / conversion_rate)
    tier_label = offer_tier.value
    reasoning = (f"With {tier_label} offer tier (est. {estimated_prr:.1%} PRR), "
                 f"need {minimum_accounts:,} accounts to close {deals_needed} deals. "
                 f"Assumes {reply_to_meeting:.0%} reply-to-meeting and {meeting_to_close:.0%} meeting-to-close. ")
    if minimum_accounts <= 1000: reasoning += "Highly viable — small test sufficient."
    elif minimum_accounts <= 3000: reasoning += "Viable — standard H1 sample of 1000/variant recommended."
    elif minimum_accounts <= 5000: reasoning += "Marginal — needs larger sample or improved conversion."
    else: reasoning += "Challenging — requires very large list or tier improvement."
    return ViableCellThreshold(
        estimated_prr=estimated_prr, offer_tier=tier_label,
        reply_to_meeting_rate=reply_to_meeting, meeting_to_close_rate=meeting_to_close,
        deals_needed=deals_needed, minimum_accounts_needed=minimum_accounts, reasoning=reasoning)


def generate_cell_code(
    client_code: str, language: str, solution_short: str,
    segment_short: str, persona_short: str, region: str
) -> str:
    """Generate stable cell code. Format: CLIENTCODE | Language | Solution Segment Persona Region"""
    return (f"{client_code.upper().strip()} | {language.upper().strip()} | "
            f"{solution_short.strip()[:10]} {segment_short.strip()[:11]} {persona_short.strip()[:8]} {region.upper().strip()}")


def generate_cell_slug(cell_code: str) -> str:
    """Convert cell_code to machine-safe kebab slug."""
    cleaned = cell_code.replace("|", " ")
    cleaned = re.sub(r'\s+', ' ', cleaned).strip().lower()
    cleaned = cleaned.replace(" ", "-")
    cleaned = re.sub(r'[^a-z0-9\-]', '', cleaned)
    return re.sub(r'-+', '-', cleaned)


def generate_run_code(cell_code: str, test_phase: TestPhase, variant: int = 1) -> str:
    """Generate run code including test phase. Format: {cell_code} | {TESTPHASE} | V{n}"""
    return f"{cell_code} | {test_phase.value} | V{variant}"


def _get_combinations_list(
    client_code: str, solutions: list[dict], segments_per_solution: dict,
    personas_per_solution: dict, cell_scores: list[dict]
) -> list[dict]:
    """Build list of approved combinations with generated cell codes."""
    approved_cells = [s for s in cell_scores if s.get("approval_status") == "approved"] or cell_scores
    combinations = []
    for score in approved_cells:
        sol_name = score.get("solution_name", "")
        seg_name = score.get("segment_name", "")
        pers_name = score.get("persona_name", "")
        solution = next((s for s in solutions if s.get("name") == sol_name), {})
        segments = segments_per_solution.get(sol_name, [])
        segment = next((s for s in segments if s.get("name") == seg_name), {})
        personas = personas_per_solution.get(sol_name, [])
        persona = next((p for p in personas if p.get("name") == pers_name), {})
        cell_code = generate_cell_code(
            client_code, persona.get("language", "EN"), solution.get("short_name", sol_name[:10]),
            segment.get("short_name", seg_name[:8]), persona.get("short_name", pers_name[:8]),
            segment.get("region", "EMEA"))
        combinations.append({
            "cell_code": cell_code, "solution_name": sol_name, "segment_name": seg_name,
            "primary_persona_name": pers_name, "entry_offer_name": solution.get("entry_offer_name", "Entry Offer"),
            "language": persona.get("language", "EN"), "region": segment.get("region", "EMEA"),
            "priority_score": score.get("total_score", 70), "priority_reasoning": score.get("reasoning", ""),
            "offer_tier": solution.get("offer_tier", "decent"), "primary_pain": solution.get("primary_pain", "")})
    return combinations


def get_cell_design_prompt(
    client_data: dict, solutions: list[dict], segments_per_solution: dict,
    personas_per_solution: dict, cell_scores: list[dict]
) -> str:
    """Generate the prompt for Kimi K2.5 to design campaign cells."""
    client_code = client_data.get("client_code", "UNKNOWN")
    client_name = client_data.get("client_name", "Unknown Client")
    combinations = _get_combinations_list(client_code, solutions, segments_per_solution, personas_per_solution, cell_scores)
    return f"""You are an expert B2B campaign strategist. Design complete campaign cells for approved solution × segment × persona combinations.

CLIENT DATA:
```json
{{"client_code": "{client_code}", "client_name": "{client_name}"}}
```

APPROVED COMBINATIONS:
```json
{json.dumps(combinations, indent=2)}
```

YOUR TASK:
For EACH approved combination, generate a complete Campaign Cell Brief with:

1. **IDENTITY** (provided above)
   - cell_code: Already generated (STABLE, no test phase)
   - cell_slug: Auto-generated from cell_code
   - solution_name, segment_name, primary_persona_name, entry_offer_name
   - language, region

2. **STRATEGY ELEMENTS**
   - hard_blocks: Absolute disqualifiers (e.g., "no Fortune 500", "must have Salesforce")
   - trigger_events: 3-5 "why now" triggers specific to this cell
   - primary_pain: The core pain point in 1 sentence
   - secondary_pains: 2-3 additional pains
   - metric_under_pressure: Which KPI is at risk (be specific)
   - proof_asset_name: Case study or asset name if available
   - why_now: Specific urgency for this cell
   - disqualifiers: Who to EXCLUDE from the list
   - secondary_awareness_stage: problem_aware | solution_aware | product_aware

3. **HOOK THEMES** — 5 themes per cell
   CATEGORIES (no copy, just themes):
   - pain_consequence: What happens if they don't act
   - trigger_event: Specific event that creates urgency
   - missed_outcome: What they're missing out on
   - cost_revelation: Hidden costs of status quo
   - status_quo_challenge: Why current approach fails

   Format each theme as:
   {{"theme_name": "Short descriptive name", "theme_category": "pain_consequence|trigger_event|missed_outcome|cost_revelation|status_quo_challenge", "description": "What this theme addresses"}}

4. **VIABLE CELL THRESHOLD**
   Calculate using:
   - deals_needed: 2 (default)
   - PRR: Based on offer tier (difficult: 0.5%, decent: 1.5%, good: 2.5%, incredible: 4%)
   - reply_to_meeting: 20%
   - meeting_to_close: 25%

   Formula: minimum_accounts = deals_needed / (PRR × 0.20 × 0.25)

   Provide reasoning on viability.

5. **TEST PLAN**
   - recommended_h1_sample_size: Accounts per variant (default 1000 if viable)
   - recommended_start_phase: Always "H1"

OUTPUT FORMAT — Return valid JSON:
```json
{{
  "campaign_cells": [
    {{
      "cell_code": "CLIENT | LANG | Solution Segment Persona Region",
      "cell_slug": "client-lang-solution-segment-persona-region",
      "solution_name": "...", "segment_name": "...", "primary_persona_name": "...",
      "entry_offer_name": "...", "language": "EN|NL|DE|FR", "region": "EMEA|DACH|Benelux|US",
      "hard_blocks": ["block 1", "block 2"],
      "trigger_events": ["event 1", "event 2"],
      "primary_pain": "...", "secondary_pains": ["pain 1", "pain 2"],
      "metric_under_pressure": "...", "proof_asset_name": "...", "why_now": "...",
      "disqualifiers": ["exclude 1", "exclude 2"],
      "secondary_awareness_stage": "problem_aware|solution_aware|product_aware",
      "hook_themes": [{{"theme_name": "...", "theme_category": "...", "description": "..."}}],
      "priority_score": 85, "priority_reasoning": "...",
      "viable_threshold": {{
        "estimated_prr": 0.015, "offer_tier": "decent",
        "reply_to_meeting_rate": 0.20, "meeting_to_close_rate": 0.25,
        "deals_needed": 2, "minimum_accounts_needed": 2667, "reasoning": "..."
      }},
      "recommended_h1_sample_size": 1000, "recommended_start_phase": "H1"
    }}
  ],
  "recommended_launch_order": ["cell_code_1", "cell_code_2"]
}}
```

RULES:
- Hook themes are CATEGORIES not copy — no subject lines or email text
- Cell codes are STABLE — never include test phase (H1/V1) in the code
- One primary persona per cell (Rule 4)
- Disqualifiers are as important as qualifiers — be explicit about exclusions
- Viability threshold must be calculated, not guessed
- Launch order by priority_score (highest first)
"""


def design_campaign_cell(
    client_data: dict, solution: dict, segment: dict, persona: dict, cell_score: dict
) -> CampaignCellBrief:
    """Design a single campaign cell from approved combination. Placeholder for AI-generated content."""
    client_code = client_data.get("client_code", "UNKNOWN")
    language = persona.get("language", "EN")
    region = segment.get("region", "EMEA")
    cell_code = generate_cell_code(
        client_code, language, solution.get("short_name", solution.get("name", "")[:10]),
        segment.get("short_name", segment.get("name", "")[:8]),
        persona.get("short_name", persona.get("name", "")[:8]), region)
    cell_slug = generate_cell_slug(cell_code)
    try: offer_tier = OfferTier(solution.get("offer_tier", "decent"))
    except ValueError: offer_tier = OfferTier.DECENT
    viable_threshold = calculate_viable_cell_threshold(offer_tier)
    hook_themes = [
        HookTheme("Primary pain consequence", "pain_consequence", "What happens if pain continues unresolved"),
        HookTheme("Recent trigger event", "trigger_event", "Specific event creating urgency"),
        HookTheme("Missed opportunity cost", "missed_outcome", "What they fail to capture")]
    return CampaignCellBrief(
        cell_code=cell_code, cell_slug=cell_slug, client_code=client_code,
        solution_name=solution.get("name", ""), segment_name=segment.get("name", ""),
        primary_persona_name=persona.get("name", ""), entry_offer_name=solution.get("entry_offer_name", ""),
        language=language, region=region, hard_blocks=["[To be determined by AI]"],
        trigger_events=["[To be determined by AI]"], primary_pain=solution.get("primary_pain", "[To be determined]"),
        secondary_pains=["[To be determined by AI]"], metric_under_pressure="[To be determined by AI]",
        proof_asset_name=None, why_now="[To be determined by AI]", disqualifiers=["[To be determined by AI]"],
        secondary_awareness_stage="problem_aware", hook_themes=hook_themes,
        priority_score=cell_score.get("total_score", 70), priority_reasoning=cell_score.get("reasoning", "[To be determined]"),
        viable_threshold=viable_threshold, recommended_h1_sample_size=1000, recommended_start_phase=TestPhase.H1)


def run_campaign_cell_design(
    client_data: dict, solutions: list[dict], segments_per_solution: dict,
    personas_per_solution: dict, cell_scores: list[dict], approved_cells: Optional[list[dict]] = None
) -> CampaignCellDesignResult:
    """SOP 3: Campaign Cell Design. Generates complete campaign cell briefs for approved solution × segment × persona combinations."""
    client_code = client_data.get("client_code", "UNKNOWN")
    client_name = client_data.get("client_name", "Unknown Client")
    cells_to_process = approved_cells or [s for s in cell_scores if s.get("approval_status") == "approved"] or cell_scores
    campaign_cells = []
    for cell_score in cells_to_process:
        sol_name = cell_score.get("solution_name", "")
        seg_name = cell_score.get("segment_name", "")
        pers_name = cell_score.get("persona_name", "")
        solution = next((s for s in solutions if s.get("name") == sol_name), {})
        segments = segments_per_solution.get(sol_name, [])
        segment = next((s for s in segments if s.get("name") == seg_name), {})
        personas = personas_per_solution.get(sol_name, [])
        persona = next((p for p in personas if p.get("name") == pers_name), {})
        if not all([solution, segment, persona]): continue
        campaign_cells.append(design_campaign_cell(client_data, solution, segment, persona, cell_score))
    sorted_cells = sorted(campaign_cells, key=lambda x: x.priority_score, reverse=True)
    return CampaignCellDesignResult(
        client_code=client_code, client_name=client_name, campaign_cells=campaign_cells,
        total_cells_generated=len(campaign_cells), recommended_launch_order=[c.cell_code for c in sorted_cells])


def cell_to_dict(cell: CampaignCellBrief) -> dict:
    """Convert cell brief to dict for JSON serialization"""
    return {
        "cell_code": cell.cell_code, "cell_slug": cell.cell_slug, "client_code": cell.client_code,
        "solution_name": cell.solution_name, "segment_name": cell.segment_name,
        "primary_persona_name": cell.primary_persona_name, "entry_offer_name": cell.entry_offer_name,
        "language": cell.language, "region": cell.region, "hard_blocks": cell.hard_blocks,
        "trigger_events": cell.trigger_events, "primary_pain": cell.primary_pain,
        "secondary_pains": cell.secondary_pains, "metric_under_pressure": cell.metric_under_pressure,
        "proof_asset_name": cell.proof_asset_name, "why_now": cell.why_now,
        "disqualifiers": cell.disqualifiers, "secondary_awareness_stage": cell.secondary_awareness_stage,
        "hook_themes": [{"theme_name": ht.theme_name, "theme_category": ht.theme_category, "description": ht.description} for ht in cell.hook_themes],
        "priority_score": cell.priority_score, "priority_reasoning": cell.priority_reasoning,
        "viable_threshold": {
            "estimated_prr": cell.viable_threshold.estimated_prr, "offer_tier": cell.viable_threshold.offer_tier,
            "reply_to_meeting_rate": cell.viable_threshold.reply_to_meeting_rate,
            "meeting_to_close_rate": cell.viable_threshold.meeting_to_close_rate,
            "deals_needed": cell.viable_threshold.deals_needed,
            "minimum_accounts_needed": cell.viable_threshold.minimum_accounts_needed,
            "reasoning": cell.viable_threshold.reasoning},
        "recommended_h1_sample_size": cell.recommended_h1_sample_size,
        "recommended_start_phase": cell.recommended_start_phase.value}


def result_to_dict(result: CampaignCellDesignResult) -> dict:
    """Convert result to dict for JSON serialization"""
    return {
        "client_code": result.client_code, "client_name": result.client_name,
        "total_cells_generated": result.total_cells_generated,
        "recommended_launch_order": result.recommended_launch_order,
        "campaign_cells": [cell_to_dict(cell) for cell in result.campaign_cells]}


if __name__ == "__main__":
    test_client = {"client_code": "SECX", "client_name": "SentioCX"}
    test_solutions = [{"name": "AI Routing", "short_name": "Routing", "offer_tier": "good", "primary_pain": "Random escalations overwhelming supervisors", "entry_offer_name": "Escalation Audit"}]
    test_segments = {"AI Routing": [{"name": "SaaS-NL", "short_name": "SaaS-NL", "region": "EMEA"}]}
    test_personas = {"AI Routing": [{"name": "VP Operations", "short_name": "VPOps", "language": "NL"}]}
    test_scores = [{"solution_name": "AI Routing", "segment_name": "SaaS-NL", "persona_name": "VP Operations", "total_score": 85, "reasoning": "High TAM, clear pain, accessible persona", "approval_status": "approved"}]
    print("=" * 60 + "\nCELL DESIGN PROMPT\n" + "=" * 60)
    print(get_cell_design_prompt(test_client, test_solutions, test_segments, test_personas, test_scores)[:1500] + "...")
    result = run_campaign_cell_design(test_client, test_solutions, test_segments, test_personas, test_scores)
    print("\n" + "=" * 60 + "\nCAMPAIGN CELL DESIGN RESULT\n" + "=" * 60)
    print(json.dumps(result_to_dict(result), indent=2))
