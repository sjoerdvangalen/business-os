"""
Offer Development Skill — GTM Strategy Framework Step 1

Based on Christian's Outbound Content framework:
- 4 Offer Tiers: Difficult, Decent, Good, Incredible
- 3 Offer Types: Sales Asset, Front-End Offer, Free Trial/Sample
- 6 Messaging Frameworks

This skill transforms client onboarding data into a validated,
tier-classified offer with front-end value props for cold traffic.
"""

from .offer_dev import (
    OfferTier,
    OfferType,
    OfferDevelopmentResult,
    analyze_offer_tier,
    develop_front_end_offer,
    develop_value_props,
    run_offer_development,
    result_to_dict,
)

__all__ = [
    "OfferTier",
    "OfferType",
    "OfferDevelopmentResult",
    "analyze_offer_tier",
    "develop_front_end_offer",
    "develop_value_props",
    "run_offer_development",
    "result_to_dict",
]
