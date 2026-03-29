"""
ICP & Persona Mapping Skill — GTM Strategy Framework Step 2

Maps solutions to concrete Ideal Customer Profile segments and buyer personas.
Generates prioritization scores for all potential campaign cells (solution × segment × persona).

Exports:
- run_icp_persona_mapping() — Main entry point
- get_icp_persona_prompt() — Generate Kimi K2.5 prompt
- All dataclasses for ICP segments, personas, and cell scoring
"""

from .icp_persona_mapping import (
    FirmographicCriteria,
    ICPSegment,
    PainAnalysis,
    BuyerPersona,
    CellPrioritizationScore,
    ICPPersonaMappingResult,
    get_icp_persona_prompt,
    run_icp_persona_mapping,
    result_to_dict,
)

__all__ = [
    "FirmographicCriteria",
    "ICPSegment",
    "PainAnalysis",
    "BuyerPersona",
    "CellPrioritizationScore",
    "ICPPersonaMappingResult",
    "get_icp_persona_prompt",
    "run_icp_persona_mapping",
    "result_to_dict",
]
