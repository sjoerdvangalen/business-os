"""
A-Leads API wrapper — business search + contact discovery.

API docs: https://docs.a-leads.co/reference/
Base URL: https://api.a-leads.co/gateway/v1
Auth: x-api-key header
Rate limits: 200/min, 600/hour, 6.000/day
"""
import os
import time
import requests

BASE_URL = "https://api.a-leads.co/gateway/v1"


def _headers() -> dict:
    key = os.environ.get("ALEADS_API_KEY")
    if not key:
        raise ValueError("ALEADS_API_KEY not set")
    return {
        "x-api-key": key,
        "Content-Type": "application/json",
    }


def _request_with_retry(method: str, url: str, json_body: dict, max_retries: int = 2) -> dict:
    for attempt in range(max_retries + 1):
        resp = requests.request(method, url, json=json_body, headers=_headers(), timeout=30)
        if resp.status_code == 429:
            wait = 2 ** attempt
            print(f"A-Leads rate limited, waiting {wait}s...")
            time.sleep(wait)
            continue
        resp.raise_for_status()
        return resp.json()
    raise Exception("A-Leads rate limit exceeded after retries")


def search_businesses(params: dict) -> list[dict]:
    """
    Search businesses via A-Leads.

    params example:
    {
        "industry": ["Software", "Internet"],
        "headcount": {"min": 50, "max": 500},
        "country": ["NL", "BE"],
        "keywords_include": ["SaaS", "platform"],
        "keywords_exclude": ["agency", "consultancy"],
        "limit": 1000,
        "offset": 0
    }
    """
    data = _request_with_retry("POST", f"{BASE_URL}/search", {"data": params})
    return data.get("results", data.get("companies", data.get("data", [])))


def search_contacts(domain: str, company_name: str = "", max_results: int = 3) -> list[dict]:
    """
    Find contacts for a company via A-Leads advanced search.
    """
    body = {
        "domain": domain,
        "company_name": company_name,
        "per_page": max_results,
    }
    data = _request_with_retry("POST", f"{BASE_URL}/contacts/search", body)
    return data.get("contacts", data.get("results", data.get("data", [])))


def search_contacts_by_title(
    company_ids: list[str],
    job_titles: list[str],
    max_results: int = 5,
) -> list[dict]:
    """
    Advanced contact search filtered by job title keywords.
    """
    body = {
        "company_id": company_ids,
        "job_title": job_titles,
        "per_page": max_results,
    }
    data = _request_with_retry("POST", f"{BASE_URL}/advanced-search", body)
    return data.get("contacts", data.get("results", data.get("data", [])))


if __name__ == "__main__":
    from dotenv import load_dotenv
    load_dotenv(os.path.expanduser("~/.claude/.env"))

    # Quick test: search 3 NL SaaS companies
    results = search_businesses({
        "industry": ["Software"],
        "country": ["NL"],
        "keywords_include": ["SaaS"],
        "limit": 3,
    })
    print(f"Found {len(results)} businesses")
    for r in results[:3]:
        print(f"  {r.get('name', '?')} — {r.get('domain', '?')}")
