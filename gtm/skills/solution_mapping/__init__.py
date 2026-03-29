"""
Solution Mapping Skill — GTM Strategy Framework SOP 1

Maps client product/service portfolio into distinct solutions.
Pain-first approach: identifies problems before prescribing solutions.

Exports:
- Enums: PainIntensity, PainUrgency, OfferType, ProofLevel, SendMode
- Dataclasses: PainPoint, BestFitContext, EntryOfferCandidate, ProofAssetCandidate, Solution, SolutionMappingResult
- Functions: get_solution_mapping_prompt, parse_solution_from_dict, run_solution_mapping, result_to_dict
"""

from .solution_mapping import (
    PainIntensity,
    PainUrgency,
    OfferType,
    ProofLevel,
    SendMode,
    PainPoint,
    BestFitContext,
    EntryOfferCandidate,
    ProofAssetCandidate,
    Solution,
    SolutionMappingResult,
    get_solution_mapping_prompt,
    parse_solution_from_dict,
    run_solution_mapping,
    result_to_dict,
)

__all__ = [
    "PainIntensity",
    "PainUrgency",
    "OfferType",
    "ProofLevel",
    "SendMode",
    "PainPoint",
    "BestFitContext",
    "EntryOfferCandidate",
    "ProofAssetCandidate",
    "Solution",
    "SolutionMappingResult",
    "get_solution_mapping_prompt",
    "parse_solution_from_dict",
    "run_solution_mapping",
    "result_to_dict",
]
