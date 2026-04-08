"""Email Bison Campaign Configuration Schema.

Defines the data structures for campaign settings and account attachment.
"""

from dataclasses import dataclass, field
from typing import Literal


@dataclass(frozen=True)
class EmailBisonCampaignSettings:
    """Standard Email Bison campaign settings based on business-os template.

    These settings match the Email Bison UI configuration for optimal
    deliverability and follow-up prioritization.
    """

    # Sending Limits (Email Bison defaults)
    max_emails_per_day: int = 10_000
    max_new_sequence_starts: int = 10_000
    # Note: Per-account limits are automatically respected by Email Bison

    # Schedule
    timezone: str = "Europe/Amsterdam"
    send_days: list[str] = field(
        default_factory=lambda: ["mon", "tue", "wed", "thu", "fri"]
    )
    send_start_time: str = "08:00"  # 24-hour format
    send_end_time: str = "17:00"  # 24-hour format

    # Sequence Configuration
    sequence_id: str | None = None  # Email Bison sequence ID
    sequence_slug: str | None = None  # Human-readable identifier (e.g., "3-step-intro")
    prioritize_followups: bool = True  # Followups scheduled before new leads

    # Tracking & Deliverability
    track_opens: bool = False  # Disabled for deliverability
    send_as_plain_text: bool = True  # HTML disabled, better deliverability
    unsubscribe_link: bool = False  # Use opt-out text in email instead
    include_auto_replies_in_stats: bool = True

    def to_emailbison_payload(self) -> dict:
        """Convert settings to Email Bison API payload format."""
        return {
            "max_emails_per_day": self.max_emails_per_day,
            "max_new_sequence_starts": self.max_new_sequence_starts,
            "schedule": {
                "timezone": self.timezone,
                "days": self.send_days,
                "start_time": self.send_start_time,
                "end_time": self.send_end_time,
            },
            "sequence": {
                "id": self.sequence_id,
                "prioritize_followups": self.prioritize_followups,
            },
            "tracking": {
                "opens": self.track_opens,
                "plain_text": self.send_as_plain_text,
            },
            "unsubscribe_link": self.unsubscribe_link,
            "include_auto_replies_in_stats": self.include_auto_replies_in_stats,
        }


@dataclass
class AccountAttachmentConfig:
    """Configuration for attaching email accounts to a campaign."""

    mode: Literal["immediate", "review"] = "review"
    min_warmup_score: int = 80  # Only warmed inboxes
    exclude_unhealthy: bool = True  # Skip if health check failed (future feature)
    accounts_per_campaign: int | None = None  # None = all warmed inboxes

    def is_valid_mode(self, mode: str) -> bool:
        """Check if mode is valid."""
        return mode in ("immediate", "review")


@dataclass
class CampaignCreateRequest:
    """Request to create a new Email Bison campaign."""

    client_code: str
    campaign_name: str  # Full name: "CLIENT | Lang | Description"
    template: str = "business_os_default"
    sequence_id: str | None = None  # Override template sequence
    account_config: AccountAttachmentConfig = field(
        default_factory=lambda: AccountAttachmentConfig(mode="review")
    )
    cell_id: str | None = None  # Optional: link to campaign_cell


@dataclass
class CampaignPreview:
    """Preview of campaign before creation (for review mode)."""

    client_code: str
    campaign_name: str
    template: str
    settings: EmailBisonCampaignSettings
    inboxes: list[dict]  # List of {email, daily_limit, warmup_score}
    total_daily_capacity: int
    can_create: bool
    warnings: list[str] = field(default_factory=list)

    def to_dict(self) -> dict:
        """Convert preview to dictionary for JSON serialization."""
        return {
            "client_code": self.client_code,
            "campaign_name": self.campaign_name,
            "template": self.template,
            "settings": {
                "max_emails_per_day": self.settings.max_emails_per_day,
                "timezone": self.settings.timezone,
                "schedule": f"{self.settings.send_start_time}-{self.settings.send_end_time}",
                "days": ",".join(self.settings.send_days),
                "track_opens": self.settings.track_opens,
                "plain_text": self.settings.send_as_plain_text,
                "unsubscribe_link": self.settings.unsubscribe_link,
            },
            "inboxes": self.inboxes,
            "total_daily_capacity": self.total_daily_capacity,
            "can_create": self.can_create,
            "warnings": self.warnings,
        }
