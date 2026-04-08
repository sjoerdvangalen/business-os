"""Email Bison Campaign Manager.

Core logic for creating and managing Email Bison campaigns with
standard business-os settings and warmed inbox attachment.
"""

import os
from datetime import datetime, timezone
from typing import Any

import requests

from .config import (
    AccountAttachmentConfig,
    CampaignCreateRequest,
    CampaignPreview,
    EmailBisonCampaignSettings,
)
from .templates import get_template, with_sequence


EMAIL_BISON_BASE_URL = "https://mail.scaleyourleads.com/api"


class CampaignManager:
    """Manages Email Bison campaigns for business-os clients."""

    def __init__(self, api_key: str | None = None):
        """Initialize with Email Bison API key.

        Args:
            api_key: Email Bison API key. If None, loads from EMAIL_BISON_API_KEY env var.
        """
        self.api_key = api_key or os.environ.get("EMAIL_BISON_API_KEY")
        if not self.api_key:
            raise ValueError(
                "Email Bison API key required. Set EMAIL_BISON_API_KEY env var."
            )
        self.base_url = EMAIL_BISON_BASE_URL

    def _headers(self) -> dict:
        """Get API request headers."""
        return {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
            "Accept": "application/json",
        }

    def _get(self, endpoint: str, params: dict | None = None) -> dict:
        """Make GET request to Email Bison API."""
        url = f"{self.base_url}/{endpoint.lstrip('/')}"
        response = requests.get(url, headers=self._headers(), params=params, timeout=30)
        response.raise_for_status()
        return response.json()

    def _post(self, endpoint: str, data: dict) -> dict:
        """Make POST request to Email Bison API."""
        url = f"{self.base_url}/{endpoint.lstrip('/')}"
        response = requests.post(url, headers=self._headers(), json=data, timeout=30)
        response.raise_for_status()
        return response.json()

    def _patch(self, endpoint: str, data: dict) -> dict:
        """Make PATCH request to Email Bison API."""
        url = f"{self.base_url}/{endpoint.lstrip('/')}"
        response = requests.patch(url, headers=self._headers(), json=data, timeout=30)
        response.raise_for_status()
        return response.json()

    def list_sequences(self) -> list[dict]:
        """List available sequences from Supabase.

        Note: EmailBison doesn't have a general /sequences endpoint.
        Sequences are stored in email_sequences table after sync.
        """
        from ...lib.supabase_client import get_client

        client = get_client()
        result = (
            client.table("email_sequences")
            .select("id, campaign_id, step_number, name, subject, variation")
            .execute()
        )
        return result.data or []

    def list_accounts(self) -> list[dict]:
        """List email accounts from Email Bison."""
        result = self._get("/accounts")
        return result.get("data", [])

    def get_warmed_inboxes_for_client(
        self,
        client_id: str,
        min_warmup_score: int = 80,
    ) -> list[dict]:
        """Get warmed email inboxes for a client from Supabase.

        Args:
            client_id: UUID of the client
            min_warmup_score: Minimum warmup score (0-100)

        Returns:
            List of inbox dicts with email, warmup_score, emailbison_id
        """
        # Import here to avoid circular dependencies
        from ...lib.supabase_client import get_client

        client = get_client()

        # Query email_inboxes for this client with provider='emailbison'
        # Note: using overall_warmup_health as proxy for warmup score (0-100)
        result = (
            client.table("email_inboxes")
            .select("id, email, provider_inbox_id, overall_warmup_health, warmup_status, status")
            .eq("client_id", client_id)
            .eq("provider", "emailbison")
            .execute()
        )

        inboxes = result.data or []

        # Filter by warmup health score
        warmed_inboxes = [
            inbox for inbox in inboxes
            if (inbox.get("overall_warmup_health") or 0) >= min_warmup_score
            or inbox.get("warmup_status") == "completed"
        ]

        return warmed_inboxes

    def preview_campaign(
        self,
        request: CampaignCreateRequest,
    ) -> CampaignPreview:
        """Generate a preview of campaign before creation.

        Args:
            request: Campaign creation request

        Returns:
            CampaignPreview with inboxes, settings, and warnings
        """
        from ...lib.supabase_client import get_client_by_code

        # Get client
        client = get_client_by_code(request.client_code)
        if not client:
            raise ValueError(f"Client not found: {request.client_code}")

        # Get template settings
        settings = get_template(request.template)

        # Override sequence if specified
        if request.sequence_id:
            settings = with_sequence(settings, request.sequence_id)

        # Get warmed inboxes
        inboxes = self.get_warmed_inboxes_for_client(
            client["id"],
            min_warmup_score=request.account_config.min_warmup_score,
        )

        # Calculate daily capacity per inbox
        warnings = []
        if not inboxes:
            warnings.append(f"No warmed inboxes found for client {request.client_code}")
            can_create = False
            total_capacity = 0
        else:
            can_create = True
            # Email Bison handles per-account limits automatically
            # We just need to know how many accounts we have
            total_capacity = len(inboxes)

        # Build inbox list for preview
        inbox_list = [
            {
                "email": inbox["email"],
                "emailbison_id": inbox.get("provider_inbox_id"),
                "warmup_score": inbox.get("overall_warmup_health") or 0,
                "status": inbox.get("status"),
            }
            for inbox in inboxes
        ]

        return CampaignPreview(
            client_code=request.client_code,
            campaign_name=request.campaign_name,
            template=request.template,
            settings=settings,
            inboxes=inbox_list,
            total_daily_capacity=total_capacity,
            can_create=can_create,
            warnings=warnings,
        )

    def create_campaign(
        self,
        request: CampaignCreateRequest,
    ) -> dict:
        """Create a new campaign in Email Bison.

        Args:
            request: Campaign creation request

        Returns:
            Dict with campaign_id, status, and details
        """
        from ...lib.supabase_client import get_client_by_code, get_client

        # Generate preview first
        preview = self.preview_campaign(request)

        # Check if we can create
        if not preview.can_create:
            return {
                "success": False,
                "error": "Cannot create campaign",
                "warnings": preview.warnings,
            }

        # If review mode, return preview without creating
        if request.account_config.mode == "review":
            return {
                "success": True,
                "mode": "review",
                "preview": preview.to_dict(),
                "message": "Review preview generated. Call with mode='immediate' to create.",
            }

        # Get client details
        client = get_client_by_code(request.client_code)
        if not client:
            raise ValueError(f"Client not found: {request.client_code}")

        # Prepare Email Bison payload
        settings = preview.settings
        payload = {
            "name": request.campaign_name,
            "max_emails_per_day": settings.max_emails_per_day,
            "max_new_leads_per_day": settings.max_new_sequence_starts,
            "plain_text": settings.send_as_plain_text,
            "track_opens": settings.track_opens,
            "unsubscribe_link": settings.unsubscribe_link,
            "include_auto_replies_in_stats": settings.include_auto_replies_in_stats,
            "sequence_prioritization": "followups" if settings.prioritize_followups else "new_leads",
        }

        # Add sequence if specified
        if settings.sequence_id:
            payload["sequence_id"] = settings.sequence_id

        # Create campaign in Email Bison
        try:
            eb_result = self._post("/campaigns", payload)
            eb_campaign_id = eb_result.get("id") or eb_result.get("data", {}).get("id")
        except requests.HTTPError as e:
            return {
                "success": False,
                "error": f"Email Bison API error: {e.response.text}",
            }

        # Update settings via PATCH /update
        # Note: POST /campaigns ignores most settings, PATCH /update applies them correctly
        settings_payload = {
            "max_emails_per_day": settings.max_emails_per_day,
            "max_new_leads_per_day": settings.max_new_sequence_starts,
            "plain_text": settings.send_as_plain_text,
            "track_opens": settings.track_opens,
            "can_unsubscribe": settings.unsubscribe_link,
            "include_auto_replies_in_stats": settings.include_auto_replies_in_stats,
            "sequence_prioritization": "followups" if settings.prioritize_followups else "new_leads",
        }

        try:
            self._patch(f"/campaigns/{eb_campaign_id}/update", settings_payload)
        except requests.HTTPError as e:
            preview.warnings.append(f"Failed to update settings: {e.response.text}")

        # Set schedule via separate endpoint
        schedule_payload = {
            "monday": "mon" in settings.send_days,
            "tuesday": "tue" in settings.send_days,
            "wednesday": "wed" in settings.send_days,
            "thursday": "thu" in settings.send_days,
            "friday": "fri" in settings.send_days,
            "saturday": "sat" in settings.send_days,
            "sunday": "sun" in settings.send_days,
            "start_time": settings.send_start_time,
            "end_time": settings.send_end_time,
            "timezone": settings.timezone,
            "save_as_template": False,
        }

        try:
            self._post(f"/campaigns/{eb_campaign_id}/schedule", schedule_payload)
        except requests.HTTPError as e:
            preview.warnings.append(f"Failed to set schedule: {e.response.text}")

        # Attach warmed inboxes to campaign
        # Using POST /api/campaigns/{id}/attach-sender-emails endpoint
        attached_accounts = []
        inboxes_to_attach = [
            inbox for inbox in preview.inboxes
            if inbox.get("emailbison_id")
        ]

        if inboxes_to_attach:
            sender_email_ids = [int(inbox["emailbison_id"]) for inbox in inboxes_to_attach]
            try:
                self._post(
                    f"/campaigns/{eb_campaign_id}/attach-sender-emails",
                    {"sender_email_ids": sender_email_ids},
                )
                attached_accounts = [inbox["email"] for inbox in inboxes_to_attach]
            except requests.HTTPError as e:
                preview.warnings.append(
                    f"Failed to attach accounts: {e.response.text}"
                )

        # Store in business-os campaigns table
        supabase = get_client()
        campaign_data = {
            "client_id": client["id"],
            "name": request.campaign_name,
            "provider": "emailbison",
            "provider_campaign_id": str(eb_campaign_id),
            "status": "active",
            "health_status": "UNKNOWN",
            "settings": settings.to_emailbison_payload(),
        }

        result = (
            supabase.table("campaigns")
            .upsert(campaign_data, on_conflict="provider,provider_campaign_id")
            .execute()
        )

        bos_campaign_id = result.data[0]["id"]

        # Link to cell if specified
        if request.cell_id:
            from ...lib.supabase_client import link_cell_to_campaign
            link_cell_to_campaign(request.cell_id, bos_campaign_id)

        return {
            "success": True,
            "emailbison_campaign_id": eb_campaign_id,
            "business_os_campaign_id": bos_campaign_id,
            "attached_accounts": attached_accounts,
            "warnings": preview.warnings,
        }

    def pause_campaign(self, provider_campaign_id: str) -> dict:
        """Pause an active campaign.

        Args:
            provider_campaign_id: Email Bison campaign ID

        Returns:
            Dict with status
        """
        try:
            result = self._post(f"/campaigns/{provider_campaign_id}/pause", {})

            # Update status in business-os
            from ...lib.supabase_client import get_client
            supabase = get_client()
            supabase.table("campaigns").update(
                {"status": "paused"}
            ).eq("provider", "emailbison").eq(
                "provider_campaign_id", provider_campaign_id
            ).execute()

            return {"success": True, "result": result}
        except requests.HTTPError as e:
            return {"success": False, "error": e.response.text}

    def resume_campaign(self, provider_campaign_id: str) -> dict:
        """Resume a paused campaign.

        Args:
            provider_campaign_id: Email Bison campaign ID

        Returns:
            Dict with status
        """
        try:
            result = self._post(f"/campaigns/{provider_campaign_id}/resume", {})

            # Update status in business-os
            from ...lib.supabase_client import get_client
            supabase = get_client()
            supabase.table("campaigns").update(
                {"status": "active"}
            ).eq("provider", "emailbison").eq(
                "provider_campaign_id", provider_campaign_id
            ).execute()

            return {"success": True, "result": result}
        except requests.HTTPError as e:
            return {"success": False, "error": e.response.text}

    def create_sequence(
        self,
        campaign_id: str,
        sequence_steps: list[dict],
        title: str | None = None,
    ) -> dict:
        """Create sequence steps for a campaign.

        Args:
            campaign_id: Email Bison campaign ID
            sequence_steps: List of step dicts with order, email_subject, email_body, wait_in_days, thread_reply, variant
            title: Optional sequence title

        Returns:
            Dict with sequence_id and status
        """
        try:
            payload = {
                "title": title or "Sequence",
                "sequence_steps": sequence_steps,
            }

            result = self._post(
                f"/campaigns/{campaign_id}/sequence-steps",
                payload,
            )

            return {
                "success": True,
                "sequence_title": title or "Sequence",
                "steps_count": len(sequence_steps),
                "result": result,
            }
        except requests.HTTPError as e:
            return {
                "success": False,
                "error": f"Failed to create sequence: {e.response.text}",
            }

    def create_campaign_with_sequence(
        self,
        request: "CampaignCreateRequest",
        sequence_steps: list[dict],
        sequence_title: str | None = None,
    ) -> dict:
        """Create a campaign and attach a sequence in one operation.

        Args:
            request: Campaign creation request
            sequence_steps: List of sequence step dicts with order, email_subject, email_body, wait_in_days, thread_reply, variant
            sequence_title: Optional title for the sequence

        Returns:
            Dict with campaign_id, sequence status, and full details
        """
        # First create the campaign
        result = self.create_campaign(request)

        if not result.get("success"):
            return result

        eb_campaign_id = result["emailbison_campaign_id"]

        # Then create the sequence
        seq_result = self.create_sequence(
            eb_campaign_id,
            sequence_steps,
            title=sequence_title or request.campaign_name
        )

        if not seq_result.get("success"):
            result["warnings"] = result.get("warnings", []) + [
                f"Campaign created but sequence failed: {seq_result.get('error')}"
            ]
            return result

        # Return combined result
        return {
            "success": True,
            "emailbison_campaign_id": eb_campaign_id,
            "business_os_campaign_id": result["business_os_campaign_id"],
            "attached_accounts": result.get("attached_accounts", []),
            "sequence": {
                "title": seq_result["sequence_title"],
                "steps_count": seq_result["steps_count"],
            },
            "warnings": result.get("warnings", []),
        }
