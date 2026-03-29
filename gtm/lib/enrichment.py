"""
Waterfall email enrichment pipeline.

Flow per contact:
  1. Check Supabase email_cache (90-day TTL)
  2. Generate 5 patterns (first@, first.last@, flast@, f.last@, firstlast@)
  3. TryKitt bulk verify — stop at first valid
  4. If all fail: Enrow find email
  5. Enrow verify found email
  6. Cache result in Supabase

Ported from:
  - business-os/supabase/functions/email-waterfall/index.ts (patterns + TryKitt)
  - plusvibe-sync/supabase/functions/onboarding-post-approval/index.ts (Enrow)
"""
import os
import re
import time
import requests
from dataclasses import dataclass, field

# Optional Supabase cache (graceful if not available)
try:
    from lib.supabase_client import check_email_cache, cache_email
    HAS_CACHE = True
except Exception:
    HAS_CACHE = False


TRYKITT_BASE_URL = "https://api.trykitt.com/v1"
ENROW_BASE_URL = "https://api.enrow.io"
ENROW_POLL_INTERVAL = 2   # seconds between polls
ENROW_POLL_TIMEOUT = 30   # max seconds to wait for async result


@dataclass
class WaterfallResult:
    email: str | None = None
    source: str = "failed"
    method: str = ""
    cost: float = 0.0
    log: list = field(default_factory=list)


def extract_linkedin_slug(url: str) -> str | None:
    if not url:
        return None
    match = re.search(r"linkedin\.com/in/([^/?\s]+)", url, re.IGNORECASE)
    return match.group(1).lower() if match else None


def generate_patterns(first_name: str, last_name: str, domain: str) -> list[str]:
    f = first_name.lower().strip()
    l = last_name.lower().strip()
    d = domain.lower().strip()
    return [
        f"{f}@{d}",
        f"{f}.{l}@{d}",
        f"{f}{l}@{d}",
        f"{f[0]}{l}@{d}",
        f"{f[0]}.{l}@{d}",
    ]


def verify_trykitt(email: str) -> dict:
    """
    Verify email via TryKitt API.
    Returns: {"is_valid": bool, "score": float, "status": str}
    """
    key = os.environ.get("TRYKITT_API_KEY")
    if not key:
        return {"is_valid": False, "status": "no_key"}

    try:
        resp = requests.post(
            f"{TRYKITT_BASE_URL}/verify",
            json={"email": email},
            headers={
                "Authorization": f"Bearer {key}",
                "Content-Type": "application/json",
            },
            timeout=10,
        )
        if resp.status_code == 429:
            time.sleep(1)
            return verify_trykitt(email)
        resp.raise_for_status()
        data = resp.json()
        is_valid = data.get("status") in ("valid", "risky")
        return {
            "is_valid": is_valid,
            "score": data.get("score", 0),
            "status": data.get("status", "unknown"),
        }
    except Exception as e:
        return {"is_valid": False, "status": "error", "error": str(e)}


def find_email_trykitt(first_name: str, last_name: str, domain: str) -> dict:
    """
    Find email via TryKitt API.
    Returns: {"email": str|None, "confidence": float, "status": str}
    """
    key = os.environ.get("TRYKITT_API_KEY")
    if not key:
        return {"email": None, "confidence": 0, "status": "no_key"}

    try:
        resp = requests.post(
            f"{TRYKITT_BASE_URL}/find",
            json={
                "first_name": first_name,
                "last_name": last_name,
                "domain": domain,
            },
            headers={
                "Authorization": f"Bearer {key}",
                "Content-Type": "application/json",
            },
            timeout=10,
        )
        if resp.status_code == 429:
            time.sleep(1)
            return find_email_trykitt(first_name, last_name, domain)
        resp.raise_for_status()
        data = resp.json()
        email = data.get("email")
        return {
            "email": email,
            "confidence": data.get("confidence", 0),
            "status": "found" if email else "not_found",
        }
    except Exception as e:
        return {"email": None, "confidence": 0, "status": "error", "error": str(e)}


def _enrow_headers() -> dict:
    return {"x-api-key": os.environ.get("ENROW_API_KEY", ""), "Content-Type": "application/json"}


def _enrow_poll(endpoint: str, job_id: str) -> dict:
    """Poll Enrow GET endpoint until result is ready or timeout."""
    headers = _enrow_headers()
    deadline = time.time() + ENROW_POLL_TIMEOUT
    while time.time() < deadline:
        resp = requests.get(f"{ENROW_BASE_URL}{endpoint}", params={"id": job_id}, headers=headers, timeout=10)
        resp.raise_for_status()
        data = resp.json()
        if data.get("status") not in ("ongoing", "pending", None):
            return data
        time.sleep(ENROW_POLL_INTERVAL)
    return {"status": "timeout"}


def find_email_enrow(first_name: str, last_name: str, domain: str) -> dict:
    """
    Find email via Enrow API (async: POST → poll GET).
    Returns: {"email": str|None, "confidence": float, "status": str}
    """
    key = os.environ.get("ENROW_API_KEY")
    if not key:
        return {"email": None, "confidence": 0, "status": "no_key"}

    try:
        resp = requests.post(
            f"{ENROW_BASE_URL}/email/find/single",
            json={"fullname": f"{first_name} {last_name}", "company_domain": domain},
            headers=_enrow_headers(),
            timeout=10,
        )
        resp.raise_for_status()
        job = resp.json()
        job_id = job.get("id")
        if not job_id:
            return {"email": None, "confidence": 0, "status": "no_id"}

        result = _enrow_poll("/email/find/single", job_id)
        email = result.get("email")
        return {
            "email": email,
            "confidence": result.get("confidence", 0),
            "status": "found" if email else result.get("status", "not_found"),
        }
    except Exception as e:
        return {"email": None, "confidence": 0, "status": "error", "error": str(e)}


def verify_enrow(email: str) -> dict:
    """
    Verify email via Enrow API (async: POST → poll GET).
    Returns: {"is_valid": bool, "status": str}
    """
    key = os.environ.get("ENROW_API_KEY")
    if not key:
        return {"is_valid": False, "status": "no_key"}

    try:
        resp = requests.post(
            f"{ENROW_BASE_URL}/email/verify/single",
            json={"email": email},
            headers=_enrow_headers(),
            timeout=10,
        )
        resp.raise_for_status()
        job = resp.json()
        job_id = job.get("id")
        if not job_id:
            return {"is_valid": False, "status": "no_id"}

        result = _enrow_poll("/email/verify/single", job_id)
        status = result.get("status", "unknown")
        is_valid = status == "valid"
        return {"is_valid": is_valid, "status": status}
    except Exception as e:
        return {"is_valid": False, "status": "error", "error": str(e)}


def run_waterfall(
    first_name: str,
    last_name: str,
    domain: str,
    linkedin_url: str = None,
) -> WaterfallResult:
    """
    Run the full 4-step waterfall enrichment for one contact.
    """
    result = WaterfallResult()
    linkedin_slug = extract_linkedin_slug(linkedin_url)

    # Step 0: Check cache
    if HAS_CACHE and linkedin_slug:
        cached = check_email_cache(linkedin_slug)
        if cached and cached.get("is_valid"):
            result.email = cached["email"]
            result.source = "cache"
            result.method = "cache"
            result.log.append({"step": "cache", "hit": True, "email": cached["email"]})
            return result

    # Step 1-2: Pattern generation + Enrow verify (free)
    patterns = generate_patterns(first_name, last_name, domain)
    result.log.append({"step": "patterns", "count": len(patterns), "patterns": patterns})

    for pattern in patterns:
        verification = verify_enrow(pattern)
        result.log.append({"step": "enrow_verify", "email": pattern, **verification})

        if verification["is_valid"]:
            result.email = pattern
            result.source = "enrow"
            result.method = "pattern"
            if HAS_CACHE and linkedin_slug:
                cache_email(linkedin_slug, pattern, "enrow", "pattern", 80)
            return result

    # Step 3: TryKitt find email (cheaper than Enrow find)
    trykitt_find = find_email_trykitt(first_name, last_name, domain)
    result.cost += 0.005
    result.log.append({"step": "trykitt_find", **trykitt_find})

    if trykitt_find.get("email"):
        # Step 4: Verify TryKitt result via Enrow
        enrow_verify = verify_enrow(trykitt_find["email"])
        result.log.append({"step": "enrow_verify", "email": trykitt_find["email"], **enrow_verify})

        if enrow_verify["is_valid"]:
            result.email = trykitt_find["email"]
            result.source = "trykitt"
            result.method = "find"
            if HAS_CACHE and linkedin_slug:
                cache_email(linkedin_slug, trykitt_find["email"], "trykitt", "find", trykitt_find.get("confidence", 70))
            return result

    # Step 5: Enrow find email (more expensive, pre-verified)
    enrow_find = find_email_enrow(first_name, last_name, domain)
    result.cost += 0.01
    result.log.append({"step": "enrow_find", **enrow_find})

    if enrow_find.get("email"):
        # Enrow find result is pre-verified, no step 4 needed
        result.email = enrow_find["email"]
        result.source = "enrow"
        result.method = "find"
        if HAS_CACHE and linkedin_slug:
            cache_email(linkedin_slug, enrow_find["email"], "enrow", "find", enrow_find.get("confidence", 70))
        return result

    result.source = "failed"
    return result


if __name__ == "__main__":
    from dotenv import load_dotenv
    load_dotenv(os.path.expanduser("~/.claude/.env"))

    # Test with a known contact
    import sys
    if len(sys.argv) >= 4:
        first, last, domain = sys.argv[1], sys.argv[2], sys.argv[3]
    else:
        first, last, domain = "test", "user", "example.com"
        print(f"Usage: python lib/enrichment.py <first> <last> <domain>")
        print(f"Running with defaults: {first} {last} {domain}\n")

    result = run_waterfall(first, last, domain)
    print(f"Email:  {result.email or 'NOT FOUND'}")
    print(f"Source: {result.source}")
    print(f"Method: {result.method}")
    print(f"Cost:   ${result.cost:.4f}")
    print(f"Steps:  {len(result.log)}")
    for entry in result.log:
        print(f"  - {entry.get('step')}: {entry}")
