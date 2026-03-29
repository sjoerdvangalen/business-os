"""
Hook Strategy Skill — GTM Strategy Framework SOP 4/5/6

Messaging development phase: hook variants, framework variants,
CTA variants, and micro-copy following H1/F1/CTA1/MC1 test discipline.
"""

from .hook_strategy import (
    # Enums
    FrameworkType,
    CTAType,
    TestPhase,
    ProofSendMode,
    FrictionLevel,
    # Dataclasses
    HookVariant,
    FrameworkVariant,
    CTAVariant,
    HookStrategyResult,
    # Constants
    FRICTION_BLOCK_THRESHOLD,
    # Functions
    generate_hook_variants,
    get_h1_prompt,
    get_f1_prompt,
    get_cta1_prompt,
    get_mc1_prompt,
    run_hook_strategy,
    result_to_dict,
)

__all__ = [
    "FrameworkType",
    "CTAType",
    "TestPhase",
    "ProofSendMode",
    "FrictionLevel",
    "HookVariant",
    "FrameworkVariant",
    "CTAVariant",
    "HookStrategyResult",
    "FRICTION_BLOCK_THRESHOLD",
    "generate_hook_variants",
    "get_h1_prompt",
    "get_f1_prompt",
    "get_cta1_prompt",
    "get_mc1_prompt",
    "run_hook_strategy",
    "result_to_dict",
]
