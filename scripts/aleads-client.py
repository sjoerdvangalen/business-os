#!/usr/bin/env python3
"""
ALeadsClient — A-Leads company sourcing client

Bevestigde endpoints:
  POST /api/auth/login                     → access_token cookie
  POST /api/tool/squirrel/company-search   → preview (geen credits), direct data
  POST /api/tool/bulk/company-search       → bulk job starten (credits)
  GET  /api/tool/bulk/files?page=1         → lijst + status + output_file_name
  POST /api/tool/bulk/download-file        → signed MinIO URL (1h geldig)
  GET  <minio-url>                         → CSV download

Usage:
  from scripts.aleads_client import ALeadsClient

  client = ALeadsClient(email="...", password="...")
  companies = client.squirrel(filters, parsed_filters)
  # of
  csv_rows = client.bulk_export(filters, parsed_filters, name="FRTC - saas-100-500 - NL")
"""
import csv
import io
import time
from dataclasses import dataclass, field
from typing import Optional

import requests

BASE_URL = "https://app.a-leads.co/api"
HEADERS = {
    "Content-Type": "application/json",
    "Origin": "https://app.a-leads.co",
    "x-host-domain": "app.a-leads.co",
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/147.0.0.0 Safari/537.36",
}


@dataclass
class Company:
    name: str
    domain: str
    linkedin_url: str
    headcount: int
    industry: str
    hq_address: str
    hq_city: str
    hq_country: str
    phone: str
    technologies: list[str] = field(default_factory=list)
    keywords: list[str] = field(default_factory=list)
    annual_revenue: str = ""
    description: str = ""


def _build_payload(filters: dict, parsed_filters: dict, name: str, credit_limit: float = 10) -> dict:
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


def _parse_csv_row(row: dict) -> Company:
    def clean_list(val: str) -> list[str]:
        if not val:
            return []
        val = val.strip()
        if val.startswith("["):
            import ast
            try:
                return [str(x) for x in ast.literal_eval(val)]
            except Exception:
                pass
        return [x.strip().strip("'") for x in val.strip("[]").split(",") if x.strip()]

    headcount_raw = row.get("# Employees", "").replace(",", "").split()[0] if row.get("# Employees") else "0"
    try:
        headcount = int(headcount_raw)
    except ValueError:
        headcount = 0

    return Company(
        name=row.get("Company", ""),
        domain=row.get("Website", "").replace("https://", "").replace("http://", "").rstrip("/"),
        linkedin_url=row.get("Company LinkedIn", ""),
        headcount=headcount,
        industry=row.get("Industries", ""),
        hq_address=row.get("Company Address", ""),
        hq_city=row.get("Company City", ""),
        hq_country=row.get("Company Country", ""),
        phone=row.get("Company Phone", ""),
        technologies=clean_list(row.get("Technologies", "")),
        keywords=clean_list(row.get("Company Keywords", "")),
        annual_revenue=row.get("Annual Revenue", ""),
        description=row.get("Company Summary", ""),
    )


class ALeadsClient:
    def __init__(self, email: str, password: str):
        self.email = email
        self.password = password
        self._session: Optional[requests.Session] = None

    def _get_session(self) -> requests.Session:
        if self._session is not None:
            return self._session

        resp = requests.post(
            f"{BASE_URL}/auth/login",
            json={"email": self.email, "password": self.password, "rememberMe": True},
            headers={**HEADERS, "Referer": "https://app.a-leads.co/auth/login"},
        )
        resp.raise_for_status()
        token = resp.cookies.get("access_token")
        if not token:
            raise RuntimeError("Login mislukt — access_token niet in response cookies")

        session = requests.Session()
        session.cookies.set("access_token", token, domain="app.a-leads.co")
        session.headers.update({**HEADERS, "Referer": "https://app.a-leads.co/app/search/company-search"})
        self._session = session
        return session

    def squirrel(self, filters: dict, parsed_filters: dict, name: str = "preview") -> tuple[list[Company], int]:
        """
        Preview search — geen credits.
        Returns (companies, total_count).
        """
        session = self._get_session()
        payload = _build_payload(filters, parsed_filters, name)
        resp = session.post(f"{BASE_URL}/tool/squirrel/company-search", json=payload)
        resp.raise_for_status()
        data = resp.json()
        meta = data.get("metaData", {})
        total = meta.get("totalCount") or len(data.get("data", []))
        companies = [self._parse_squirrel_row(c) for c in data.get("data", [])]
        return companies, total

    def _parse_squirrel_row(self, c: dict) -> Company:
        return Company(
            name=c.get("company_name", ""),
            domain=c.get("domain", ""),
            linkedin_url=c.get("company_linkedin_url", ""),
            headcount=c.get("company_headcount") or 0,
            industry=c.get("industry", ""),
            hq_address=c.get("hq_full_address", ""),
            hq_city="",
            hq_country="",
            phone="",
            technologies=[],
            keywords=c.get("categories_and_keywords", []),
        )

    def bulk_export(
        self,
        filters: dict,
        parsed_filters: dict,
        name: str,
        credit_limit: float = 100,
        poll_interval: int = 3,
        max_wait: int = 120,
    ) -> list[Company]:
        """
        Start bulk export → poll tot completed → download CSV → return companies.
        Naam moet uniek zijn (anders 400 Duplicate file name not allowed).
        """
        session = self._get_session()
        unique_name = f"{name} {int(time.time())}"
        payload = _build_payload(filters, parsed_filters, unique_name, credit_limit)

        resp = session.post(f"{BASE_URL}/tool/bulk/company-search", json=payload)
        resp.raise_for_status()

        # Poll tot status = completed
        output_file_name = self._poll_until_ready(session, unique_name, poll_interval, max_wait)
        if not output_file_name:
            raise RuntimeError(f"Bulk export '{unique_name}' niet klaar binnen {max_wait}s")

        # Download signed URL + CSV
        r = session.post(f"{BASE_URL}/tool/bulk/download-file", json={"fileName": output_file_name})
        r.raise_for_status()
        signed_url = r.json()["data"]

        csv_resp = requests.get(signed_url)
        csv_resp.raise_for_status()

        reader = csv.DictReader(io.StringIO(csv_resp.text))
        return [_parse_csv_row(row) for row in reader]

    def _poll_until_ready(
        self, session: requests.Session, name: str, interval: int, max_wait: int
    ) -> Optional[str]:
        """Poll /tool/bulk/files tot export met naam klaar is. Geeft output_file_name terug."""
        deadline = time.time() + max_wait
        while time.time() < deadline:
            r = session.get(f"{BASE_URL}/tool/bulk/files?page=1&pageSize=20")
            r.raise_for_status()
            for f in r.json()["data"]["files"]:
                if f["name"] == name:
                    if f["status"] == "completed":
                        return f["output_file_name"]
                    if f["status"] in ("failed", "error"):
                        raise RuntimeError(f"Bulk export mislukt: {f}")
            time.sleep(interval)
        return None

    def get_dnc_filter(self, dnc_domains: list[str]) -> str:
        """Zet lijst domains om naar newline-separated string voor A-Leads DNC filter."""
        return "\n".join(dnc_domains)


if __name__ == "__main__":
    import os

    email = os.environ.get("ALEADS_EMAIL", "sjoerd@vggacquisition.com")
    password = os.environ.get("ALEADS_PASSWORD", "")
    if not password:
        print("ALEADS_PASSWORD niet gezet")
        raise SystemExit(1)

    client = ALeadsClient(email=email, password=password)

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

    print("=== Squirrel preview ===")
    companies, total = client.squirrel(filters, parsed_filters, name="Test preview")
    print(f"Total: {total} | In response: {len(companies)}")
    for c in companies:
        print(f"  {c.name} | {c.domain} | {c.headcount} emp")

    proceed = input("\nBulk export proberen? (ja/nee): ").strip().lower()
    if proceed == "ja":
        print("\n=== Bulk export ===")
        companies = client.bulk_export(filters, parsed_filters, name="Test Ziggo KPN", credit_limit=5)
        print(f"Gedownload: {len(companies)} bedrijven")
        for c in companies[:5]:
            print(f"  {c.name} | {c.domain} | {c.headcount} emp | {c.hq_city}")
