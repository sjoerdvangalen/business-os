#!/usr/bin/env python3
"""
A-Leads API test — bevestigde endpoints en payload formaten

BEVINDINGEN:
- Login: POST /api/auth/login → set-cookie: access_token=<jwt>
- Squirrel: POST /api/tool/squirrel/company-search
  - Vereist FULL bulk-style payload (niet alleen {"filters": ...})
  - Response: {message, data: [...companies], metaData: {totalCount, savedCount, newCount}}
  - Geen credits
- Bulk: POST /api/tool/bulk/company-search
  - Response: {message: {status: "success"}} — GEEN export_id
  - Resultaten gaan naar A-Leads UI downloads pagina (niet via API ophaalbaar)
  - Bulk naam moet uniek zijn (anders 400 "Duplicate file name not allowed")
- filters.mapped_company_size = strings ["7","8","9"]
- parsedFilters.mapped_company_size = integers [7,8,9]

Usage:
  ALEADS_EMAIL=... ALEADS_PASSWORD=... python3 scripts/aleads-test.py
"""
import json
import os
import sys
import time

import requests

BASE_URL = "https://app.a-leads.co/api"

EMAIL = os.environ.get("ALEADS_EMAIL", "sjoerd@vggacquisition.com")
PASSWORD = os.environ.get("ALEADS_PASSWORD", "")


def login() -> requests.Session:
    print(f"Inloggen als {EMAIL}...")
    resp = requests.post(
        f"{BASE_URL}/auth/login",
        json={"email": EMAIL, "password": PASSWORD, "rememberMe": True},
        headers={
            "Content-Type": "application/json",
            "Origin": "https://app.a-leads.co",
            "Referer": "https://app.a-leads.co/auth/login",
            "x-host-domain": "app.a-leads.co",
        },
    )
    if not resp.ok:
        print(f"Login mislukt: {resp.status_code} — {resp.text[:200]}")
        sys.exit(1)

    token = resp.cookies.get("access_token")
    if not token:
        print(f"Geen access_token in response cookies: {dict(resp.cookies)}")
        sys.exit(1)

    print(f"Login OK — token: {token[:30]}...")

    session = requests.Session()
    session.cookies.set("access_token", token, domain="app.a-leads.co")
    session.headers.update({
        "Content-Type": "application/json",
        "Origin": "https://app.a-leads.co",
        "Referer": "https://app.a-leads.co/app/search/company-search",
        "x-host-domain": "app.a-leads.co",
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/147.0.0.0 Safari/537.36",
    })
    return session


def build_payload(filters: dict, parsed_filters: dict, name: str, credit_limit: float = 10) -> dict:
    """Bouw standaard A-Leads payload. Wordt gebruikt voor zowel squirrel als bulk."""
    return {
        "searchType": "total",
        "exportType": "company_search",
        "name": name,
        "filters": filters,
        "parsedFilters": parsed_filters,
        "creditLimit": credit_limit,
        "phoneEnrich": False,
        "emailEnrich": False,
        "personalEmailEnrich": False,
        "partialEnrich": False,
        "crm": {"enabled": False, "selectedProfile": None},
        "maxPeoplePerCompany": None,
    }


def squirrel_search(session: requests.Session, filters: dict, parsed_filters: dict, name: str = "Test") -> dict:
    """Preview search — geen credits. Geeft company data + metaData.totalCount terug."""
    payload = build_payload(filters, parsed_filters, name)
    print(f"\nSquirrel call voor '{name}'...")
    resp = session.post(f"{BASE_URL}/tool/squirrel/company-search", json=payload)
    print(f"Status: {resp.status_code}")
    if not resp.ok:
        print(f"Error: {resp.text[:500]}")
        return {}
    data = resp.json()
    meta = data.get("metaData", {})
    companies = data.get("data", [])
    print(f"totalCount: {meta.get('totalCount')} | savedCount: {meta.get('savedCount')} | newCount: {meta.get('newCount')}")
    print(f"Bedrijven in response: {len(companies)}")
    for c in companies[:10]:
        print(f"  {c.get('company_name')} | {c.get('domain')} | {c.get('company_headcount')} emp | {c.get('hq_full_address', '')[:50]}")
    return data


def bulk_search(session: requests.Session, filters: dict, parsed_filters: dict, name: str, credit_limit: float = 5) -> dict:
    """
    Bulk export — gebruikt credits.
    LET OP: naam moet uniek zijn. Resultaten gaan naar A-Leads UI downloads pagina.
    Response bevat GEEN export_id — er is geen API polling mogelijk.
    """
    unique_name = f"{name} {int(time.time())}"
    payload = build_payload(filters, parsed_filters, unique_name, credit_limit)
    print(f"\nBulk export call (creditLimit={credit_limit}, naam='{unique_name}')...")
    resp = session.post(f"{BASE_URL}/tool/bulk/company-search", json=payload)
    print(f"Status: {resp.status_code}")
    if not resp.ok:
        print(f"Error: {resp.text[:500]}")
        return {}
    data = resp.json()
    print(f"Response: {json.dumps(data, indent=2)}")
    print("→ Resultaten: controleer A-Leads UI > Exports/Downloads")
    return data


if __name__ == "__main__":
    if not PASSWORD:
        print("ALEADS_PASSWORD env var niet gezet")
        print("Run: ALEADS_PASSWORD=... python3 scripts/aleads-test.py")
        sys.exit(1)

    session = login()

    # Ziggo + KPN — NL telecom, 500+ medewerkers
    filters = {
        "categories_and_keywords": ["ziggo", "kpn"],
        "hq_location": ["netherlands"],
        "mapped_company_size": ["7", "8", "9"],
        "__showIncludedCompanyKeywords": True,
        "__company_keyword_include_name": True,
        "__company_keyword_include_desc": True,
        "__showExcludedCompanyKeywords": False,
        "__showExcludedTechnologies": False,
    }
    parsed_filters = {
        "categories_and_keywords": ["ziggo", "kpn"],
        "hq_location": ["netherlands"],
        "mapped_company_size": [7, 8, 9],
        "company_keyword_include_name": True,
        "company_keyword_include_desc": True,
    }

    squirrel_search(session, filters, parsed_filters, name="Test Ziggo KPN")
