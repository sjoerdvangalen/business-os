"""Email Bison Campaign Templates.

Pre-defined campaign settings (NOT sequences).
Sequences are built using patterns from patterns.py - no hardcoded templates.

For sequence patterns, see:
- patterns.py: Salutations, closings, variables, structure patterns
"""

from .config import EmailBisonCampaignSettings


def get_template(name: str) -> EmailBisonCampaignSettings:
    """Get a campaign template by name.

    Args:
        name: Template name (e.g., "business_os_default")

    Returns:
        EmailBisonCampaignSettings instance

    Raises:
        ValueError: If template name is not found
    """
    templates = {
        "business_os_default": business_os_default,
    }

    if name not in templates:
        available = ", ".join(templates.keys())
        raise ValueError(f"Unknown template: {name}. Available: {available}")

    return templates[name]()


def list_templates() -> list[str]:
    """List all available template names."""
    return ["business_os_default"]


def business_os_default() -> EmailBisonCampaignSettings:
    """Standard business-os Email Bison template.

    Optimized for B2B cold outreach with maximum deliverability:
    - Disabled open tracking (better deliverability)
    - Plain text emails (no HTML/images/links)
    - No unsubscribe link (use opt-out text instead)
    - Follow-ups prioritized over new leads
    - Business hours only (08:00-17:00, Mon-Fri)

    Settings match the Email Bison UI configuration screenshot:
    - Max emails/day: 10000 (Email Bison default)
    - Max new sequences/day: 10000
    - Email account limits auto-respected by Email Bison
    - Automated replies included in stats
    """
    return EmailBisonCampaignSettings(
        # Sending Limits (Email Bison defaults)
        max_emails_per_day=10_000,
        max_new_sequence_starts=10_000,
        # Schedule: Business hours, weekdays only
        timezone="Europe/Amsterdam",
        send_days=["mon", "tue", "wed", "thu", "fri"],
        send_start_time="08:00",
        send_end_time="17:00",
        # Sequence: Followups prioritized
        sequence_id=None,  # Must be specified at creation time
        sequence_slug=None,  # Human-readable identifier
        prioritize_followups=True,
        # Tracking & Deliverability
        track_opens=False,  # Disabled for deliverability
        send_as_plain_text=True,  # Plain text only
        unsubscribe_link=False,  # Use opt-out text in email
        include_auto_replies_in_stats=True,
    )


def with_sequence(settings: EmailBisonCampaignSettings, sequence_id: str, sequence_slug: str | None = None) -> EmailBisonCampaignSettings:
    """Create a copy of settings with a specific sequence.

    Args:
        settings: Base settings to copy
        sequence_id: Email Bison sequence ID
        sequence_slug: Optional human-readable sequence identifier

    Returns:
        New EmailBisonCampaignSettings with sequence configured
    """
    return EmailBisonCampaignSettings(
        max_emails_per_day=settings.max_emails_per_day,
        max_new_sequence_starts=settings.max_new_sequence_starts,
        timezone=settings.timezone,
        send_days=settings.send_days,
        send_start_time=settings.send_start_time,
        send_end_time=settings.send_end_time,
        sequence_id=sequence_id,
        sequence_slug=sequence_slug,
        prioritize_followups=settings.prioritize_followups,
        track_opens=settings.track_opens,
        send_as_plain_text=settings.send_as_plain_text,
        unsubscribe_link=settings.unsubscribe_link,
        include_auto_replies_in_stats=settings.include_auto_replies_in_stats,
    )
