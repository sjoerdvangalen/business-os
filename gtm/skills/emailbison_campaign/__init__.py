"""Email Bison Campaign Skill for business-os.

Standardized campaign creation with warmed inbox attachment.
Uses Email Bison spintax patterns: {optie1|optie2} + {FIRST_NAME} variables.
"""

from .config import (
    AccountAttachmentConfig,
    CampaignCreateRequest,
    CampaignPreview,
    EmailBisonCampaignSettings,
)
from .emailbison_campaign import CampaignManager
from . import patterns
from .templates import get_template, list_templates, with_sequence

__all__ = [
    # Config
    "AccountAttachmentConfig",
    "CampaignCreateRequest",
    "CampaignManager",
    "CampaignPreview",
    "EmailBisonCampaignSettings",
    # Templates (campaign settings only)
    "get_template",
    "list_templates",
    "with_sequence",
    # Patterns module (spintax + variables)
    "patterns",
]
