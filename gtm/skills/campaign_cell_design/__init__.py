"""
Campaign Cell Design Skill — GTM Strategy Framework SOP 3

Transforms approved solution × segment × persona combinations into
complete campaign cell briefs with hook themes, viability thresholds,
and launch prioritization.
"""

from .campaign_cell_design import (
    # Enums
    OfferTier,
    TestPhase,

    # Dataclasses
    HookTheme,
    ViableCellThreshold,
    CampaignCellBrief,
    CampaignCellDesignResult,

    # Core functions
    get_tier_prr,
    calculate_viable_cell_threshold,
    generate_cell_code,
    generate_cell_slug,
    generate_run_code,
    get_cell_design_prompt,
    design_campaign_cell,
    run_campaign_cell_design,

    # Serialization
    cell_to_dict,
    result_to_dict,
)

__all__ = [
    # Enums
    "OfferTier",
    "TestPhase",

    # Dataclasses
    "HookTheme",
    "ViableCellThreshold",
    "CampaignCellBrief",
    "CampaignCellDesignResult",

    # Core functions
    "get_tier_prr",
    "calculate_viable_cell_threshold",
    "generate_cell_code",
    "generate_cell_slug",
    "generate_run_code",
    "get_cell_design_prompt",
    "design_campaign_cell",
    "run_campaign_cell_design",

    # Serialization
    "cell_to_dict",
    "result_to_dict",
]
