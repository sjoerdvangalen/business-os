"""Email Bison Campaign Skill for business-os.

Standardized campaign creation with warmed inbox attachment.
"""

from .config import (
    AccountAttachmentConfig,
    CampaignCreateRequest,
    CampaignPreview,
    EmailBisonCampaignSettings,
)
from .emailbison_campaign import CampaignManager
from .templates import get_template, list_templates, with_sequence

__all__ = [
    "AccountAttachmentConfig",
    "CampaignCreateRequest",
    "CampaignManager",
    "CampaignPreview",
    "EmailBisonCampaignSettings",
    "get_template",
    "list_templates",
    "with_sequence",
]
