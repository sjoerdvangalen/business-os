"""
Supabase client for GTM automation — campaign state + email cache.
"""
import os
from datetime import datetime, timedelta, timezone
from supabase import create_client, Client

_client = None


def get_client() -> Client:
    global _client
    if _client is None:
        url = os.environ["SUPABASE_URL"]
        key = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
        _client = create_client(url, key)
    return _client


# --- Campaign Plans ---

def create_campaign_plan(
    client_code: str,
    campaign_name: str,
    context: dict,
    google_doc_id: str = None,
    google_doc_url: str = None,
) -> dict:
    result = get_client().table("campaign_plans").insert({
        "client_code": client_code,
        "campaign_name": campaign_name,
        "context": context,
        "google_doc_id": google_doc_id,
        "google_doc_url": google_doc_url,
        "status": "review",
    }).execute()
    return result.data[0]


def update_campaign_status(campaign_id: str, status: str, **extra) -> dict:
    payload = {"status": status, "updated_at": datetime.now(timezone.utc).isoformat()}
    payload.update(extra)
    result = get_client().table("campaign_plans").update(payload).eq("id", campaign_id).execute()
    return result.data[0]


def get_campaign_plan(campaign_id: str) -> dict:
    result = get_client().table("campaign_plans").select("*").eq("id", campaign_id).single().execute()
    return result.data


def append_execution_log(campaign_id: str, entry: dict):
    plan = get_campaign_plan(campaign_id)
    log = plan.get("execution_log") or []
    log.append({**entry, "timestamp": datetime.now(timezone.utc).isoformat()})
    get_client().table("campaign_plans").update({
        "execution_log": log,
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }).eq("id", campaign_id).execute()


# --- Email Cache ---

def check_email_cache(linkedin_slug: str) -> dict | None:
    now = datetime.now(timezone.utc).isoformat()
    result = (
        get_client()
        .table("email_cache")
        .select("*")
        .eq("linkedin_slug", linkedin_slug)
        .gt("expires_at", now)
        .maybe_single()
        .execute()
    )
    return result.data


def cache_email(
    linkedin_slug: str,
    email: str,
    source: str,
    method: str,
    score: float = 80.0,
):
    expires = (datetime.now(timezone.utc) + timedelta(days=90)).isoformat()
    get_client().table("email_cache").upsert({
        "linkedin_slug": linkedin_slug,
        "email": email,
        "is_valid": True,
        "validation_source": source,
        "validation_method": method,
        "confidence_score": score,
        "validated_at": datetime.now(timezone.utc).isoformat(),
        "expires_at": expires,
    }).execute()


if __name__ == "__main__":
    from dotenv import load_dotenv
    load_dotenv(os.path.expanduser("~/.claude/.env"))
    client = get_client()
    print(f"Supabase connected: {client.supabase_url}")
