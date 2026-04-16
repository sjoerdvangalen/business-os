"""
Supabase client for GTM automation — businesses, contacts, campaign cells, gtm_strategies.
"""
import os
from datetime import datetime, timezone
from typing import Any
from supabase import create_client, Client

_client = None


def get_client() -> Client:
    global _client
    if _client is None:
        url = os.environ["SUPABASE_URL"]
        key = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
        _client = create_client(url, key)
    return _client


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


# --- GTM Strategy (clients.strategy — legacy mirror; canonical: gtm_strategies table) ---

def update_gtm_synthesis(client_id: str, synthesis: dict) -> dict:
    result = (
        get_client()
        .table("clients")
        .update({"strategy": synthesis, "updated_at": _now()})
        .eq("id", client_id)
        .execute()
    )
    return result.data[0]


def get_gtm_synthesis(client_id: str) -> dict:
    result = (
        get_client()
        .table("clients")
        .select("strategy")
        .eq("id", client_id)
        .single()
        .execute()
    )
    return result.data.get("strategy") or {}


def get_client_by_code(client_code: str) -> dict | None:
    result = (
        get_client()
        .table("clients")
        .select("id, name, client_code")
        .eq("client_code", client_code)
        .maybe_single()
        .execute()
    )
    return result.data


# --- Campaign Cells ---

def upsert_campaign_cell(
    client_id: str,
    cell_code: str,
    cell_slug: str,
    solution_name: str,
    segment_name: str,
    persona_name: str,
    brief: dict,
    language: str = "EN",
    region: str = "NL",
    priority_score: int = 70,
    campaign_id: str | None = None,
) -> dict:
    payload: dict[str, Any] = {
        "client_id": client_id,
        "cell_code": cell_code,
        "cell_slug": cell_slug,
        "solution_name": solution_name,
        "segment_name": segment_name,
        "persona_name": persona_name,
        "language": language,
        "region": region,
        "priority_score": priority_score,
        "brief": brief,
        "cell_status": "brief_ready",
        "updated_at": _now(),
    }
    if campaign_id:
        payload["campaign_id"] = campaign_id

    result = (
        get_client()
        .table("campaign_cells")
        .upsert(payload, on_conflict="client_id,cell_slug")
        .execute()
    )
    return result.data[0]


def link_cell_to_campaign(cell_id: str, campaign_id: str) -> dict:
    result = (
        get_client()
        .table("campaign_cells")
        .update({"campaign_id": campaign_id, "cell_status": "live", "updated_at": _now()})
        .eq("id", cell_id)
        .execute()
    )
    return result.data[0]


def append_cell_run(cell_id: str, run: dict) -> dict:
    """Append a test-phase run to campaign_cells.runs JSONB array."""
    cell = (
        get_client()
        .table("campaign_cells")
        .select("runs")
        .eq("id", cell_id)
        .single()
        .execute()
    ).data
    runs = cell.get("runs") or []
    runs = [*runs, {**run, "started_at": run.get("started_at", _now())}]
    result = (
        get_client()
        .table("campaign_cells")
        .update({"runs": runs, "updated_at": _now()})
        .eq("id", cell_id)
        .execute()
    )
    return result.data[0]


def get_cells_for_client(client_id: str) -> list[dict]:
    result = (
        get_client()
        .table("campaign_cells")
        .select("*")
        .eq("client_id", client_id)
        .order("priority_score", desc=True)
        .execute()
    )
    return result.data or []


# --- Companies ---

def upsert_company(domain: str, name: str, enrichment_data: dict | None = None) -> dict:
    payload: dict[str, Any] = {
        "domain": domain,
        "name": name,
        "updated_at": _now(),
    }
    if enrichment_data:
        payload["enrichment_data"] = enrichment_data

    result = (
        get_client()
        .table("companies")
        .upsert(payload, on_conflict="domain")
        .execute()
    )
    return result.data[0]


def get_company_by_domain(domain: str) -> dict | None:
    result = (
        get_client()
        .table("companies")
        .select("id, name, domain")
        .eq("domain", domain)
        .maybe_single()
        .execute()
    )
    return result.data


# --- Contacts ---

def upsert_contact(
    email: str,
    company_id: str,
    first_name: str = "",
    last_name: str = "",
    title: str | None = None,
    linkedin_url: str | None = None,
    source: str = "a-leads",
    source_id: str | None = None,
    enrichment_data: dict | None = None,
) -> dict:
    payload: dict[str, Any] = {
        "email": email,
        "company_id": company_id,
        "first_name": first_name,
        "last_name": last_name,
        "source": source,
        "email_waterfall_status": "existing" if email else "pending",
        "updated_at": _now(),
    }
    if title:
        payload["title"] = title
    if linkedin_url:
        payload["linkedin_url"] = linkedin_url
    if source_id:
        payload["source_id"] = source_id
    if enrichment_data:
        payload["enrichment_data"] = enrichment_data

    result = (
        get_client()
        .table("contacts")
        .upsert(payload, on_conflict="email")
        .execute()
    )
    return result.data[0]


def get_contact_by_linkedin(linkedin_url: str) -> dict | None:
    result = (
        get_client()
        .table("contacts")
        .select("id, email, email_verified, email_verified_at")
        .eq("linkedin_url", linkedin_url)
        .maybe_single()
        .execute()
    )
    return result.data


# --- Leads (contact × campaign linking table) ---

def link_contact_to_campaign(
    contact_id: str,
    campaign_id: str,
    client_id: str,
) -> dict:
    payload: dict[str, Any] = {
        "contact_id": contact_id,
        "campaign_id": campaign_id,
        "client_id": client_id,
        "status": "targeted",
    }

    result = (
        get_client()
        .table("leads")
        .upsert(payload, on_conflict="contact_id,campaign_id")
        .execute()
    )
    return result.data[0]


if __name__ == "__main__":
    from dotenv import load_dotenv
    load_dotenv(os.path.expanduser("~/.claude/.env"))
    client = get_client()
    print(f"Supabase connected: {client.supabase_url}")
