#!/usr/bin/env python3
"""
GTM Campaign Orchestrator — end-to-end flow controller.

Usage:
  python orchestrator.py create --context storage/orchestrations/SECX.json
  python orchestrator.py execute --client-code SECX

Phase A (create):
  Context JSON → clients.gtm_synthesis + campaign_cells → Google Doc → Slack

Phase B (execute):
  client_code → campaign_cells.brief.aleads_config → businesses + contacts + contact_campaigns → Slack

Context JSON schema (for create):
  {
    "client_code": "SECX",
    "client_name": "SentioCX",
    "synthesis": {
      "solutions": [...],
      "icp_segments": [...],
      "personas": [...],
      "entry_offers": [...],
      "recommended_cells": [...],
      "gate_status": "approved",
      "google_doc_url": null
    },
    "campaign_cells": [
      {
        "cell_code": "SECX | NL | ...",
        "cell_slug": "secx-nl-...",
        "solution_name": "...",
        "segment_name": "...",
        "persona_name": "...",
        "language": "NL",
        "region": "EMEA",
        "priority_score": 85,
        "brief": {
          "offer_name": "...",
          "offer_type": "audit",
          "hook_themes": [...],
          "aleads_config": {
            "industry": [...],
            "headcount": {"min": 50, "max": 500},
            "country": [...],
            "keywords_include": [...],
            "keywords_exclude": [...],
            "job_titles": [...],
            "volume": 1000
          }
        }
      }
    ]
  }
"""
import argparse
import json
import os
import sys
import time

sys.path.insert(0, os.path.dirname(__file__))

from lib import slack, aleads, enrichment

HAS_SUPABASE = False
try:
    from lib import supabase_client
    HAS_SUPABASE = bool(os.environ.get("SUPABASE_SERVICE_ROLE_KEY"))
except Exception:
    pass

try:
    from googleapiclient.discovery import build
    from lib.google_auth import get_credentials
    HAS_GOOGLE = True
except Exception:
    HAS_GOOGLE = False


def load_context(path: str) -> dict:
    with open(path) as f:
        return json.load(f)


def create_campaign(context: dict) -> dict:
    """
    Phase A: Synthesize GTM strategy and create campaign cells.

    1. Resolve client_id from clients table
    2. Write synthesis to clients.gtm_synthesis
    3. Upsert campaign_cells rows (one per cell in context)
    4. Create Google Doc (if configured)
    5. Slack notification
    """
    client_code = context["client_code"]
    synthesis = context.get("synthesis", {})
    cells = context.get("campaign_cells", [])

    print(f"Creating GTM strategy: {client_code}")

    # Step 1: Resolve client_id
    client_record = None
    if HAS_SUPABASE:
        client_record = supabase_client.get_client_by_code(client_code)
        if not client_record:
            print(f"  ERROR: Client '{client_code}' not found in clients table")
            return {"error": f"client {client_code} not found"}
        client_id = client_record["id"]
        print(f"  Resolved client_id: {client_id}")
    else:
        client_id = None
        print("  SKIP: Supabase not configured — dry run mode")

    # Step 2: Write synthesis to clients.gtm_synthesis
    if HAS_SUPABASE and synthesis:
        supabase_client.update_gtm_synthesis(client_id, synthesis)
        print(f"  clients.gtm_synthesis updated ({len(synthesis.get('solutions', []))} solutions, "
              f"{len(synthesis.get('icp_segments', []))} segments)")

    # Step 3: Upsert campaign_cells
    created_cells = []
    if HAS_SUPABASE and cells:
        for cell in cells:
            row = supabase_client.upsert_campaign_cell(
                client_id=client_id,
                cell_code=cell["cell_code"],
                cell_slug=cell["cell_slug"],
                solution_name=cell["solution_name"],
                segment_name=cell["segment_name"],
                persona_name=cell.get("persona_name", cell.get("primary_persona_name", "")),
                brief=cell.get("brief", {}),
                language=cell.get("language", "EN"),
                region=cell.get("region", "NL"),
                priority_score=cell.get("priority_score", 70),
            )
            created_cells.append(row)
        print(f"  Upserted {len(created_cells)} campaign_cells")

    # Step 4: Google Doc
    doc_url = synthesis.get("google_doc_url")
    if not doc_url and HAS_GOOGLE:
        try:
            from create_template_b_v2 import create_template_b
            _, doc_url = create_template_b(
                client_code=client_code,
                client_name=context.get("client_name", client_code),
                campaign_name=f"{client_code} | GTM Strategy",
            )
            print(f"  Google Doc created: {doc_url}")
            if HAS_SUPABASE and synthesis:
                supabase_client.update_gtm_synthesis(client_id, {**synthesis, "google_doc_url": doc_url})
        except Exception as e:
            print(f"  WARN: Google Doc failed: {e}")
    elif doc_url:
        print(f"  Google Doc: {doc_url}")
    else:
        print("  SKIP: Google OAuth not configured")

    # Step 5: Slack
    try:
        msg = f"GTM plan klaar: {client_code} | {len(created_cells)} cells"
        if doc_url:
            msg += f" | review: {doc_url}"
        slack.send_message(msg)
        print("  Slack notification sent")
    except Exception as e:
        print(f"  WARN: Slack failed: {e}")

    result = {
        "client_code": client_code,
        "client_id": client_id,
        "cells_created": len(created_cells),
        "google_doc_url": doc_url,
    }
    print(f"\nStrategy created. {len(created_cells)} cells ready.")
    if cells:
        print(f"Next: run `python orchestrator.py execute --client-code {client_code}`")
    return result


def execute_campaign(client_code: str) -> dict:
    """
    Phase B: Run data pipeline for all campaign cells of a client.

    1. Load campaign_cells from Supabase (reads brief.aleads_config per cell)
    2. Per cell: A-Leads business search → upsert_company
    3. Contact discovery per business → waterfall enrichment → upsert_contact
    4. Link contact → contact_campaigns
    5. Slack summary
    """
    if not HAS_SUPABASE:
        raise RuntimeError("SUPABASE_SERVICE_ROLE_KEY is required for execute")

    # Step 1: Resolve client + load cells
    client_record = supabase_client.get_client_by_code(client_code)
    if not client_record:
        raise ValueError(f"Client '{client_code}' not found in clients table")
    client_id = client_record["id"]

    cells = supabase_client.get_cells_for_client(client_id)
    if not cells:
        print(f"No campaign_cells found for {client_code}. Run `create` first.")
        return {"error": "no cells found"}

    print(f"Executing {client_code} — {len(cells)} cells")

    stats = {
        "cells_processed": 0,
        "businesses_found": 0,
        "contacts_found": 0,
        "emails_verified": 0,
        "total_cost": 0.0,
    }

    for cell in cells:
        cell_code = cell["cell_code"]
        brief = cell.get("brief") or {}
        aleads_config = brief.get("aleads_config")

        if not aleads_config:
            print(f"  SKIP {cell_code}: no aleads_config in brief")
            continue

        print(f"\n  Cell: {cell_code}")

        # Step 2: A-Leads business search
        search_params = {
            "industry": aleads_config.get("industry", []),
            "headcount": aleads_config.get("headcount", {}),
            "country": aleads_config.get("country", []),
            "keywords_include": aleads_config.get("keywords_include", []),
            "keywords_exclude": aleads_config.get("keywords_exclude", []),
            "limit": aleads_config.get("volume", 500),
        }
        businesses = aleads.search_businesses(search_params)
        print(f"    A-Leads: {len(businesses)} businesses")
        stats["businesses_found"] += len(businesses)

        # Campaign ID for linking (nullable — cell may not yet be linked to PlusVibe)
        campaign_id = cell.get("campaign_id")

        for biz in businesses:
            domain = biz.get("domain", "")
            name = biz.get("name", "")
            if not domain:
                continue

            # Upsert business
            business_row = supabase_client.upsert_company(
                domain=domain,
                name=name,
                enrichment_data={
                    "industry": biz.get("industry"),
                    "headcount": biz.get("headcount"),
                    "country": biz.get("country"),
                    "source": "a-leads",
                },
            )
            company_id = business_row["id"]

            # Step 3: Contact discovery
            job_titles = aleads_config.get("job_titles", [])
            contacts = aleads.search_contacts(domain, name, max_results=3)
            stats["contacts_found"] += len(contacts)

            for contact in contacts:
                first = contact.get("first_name", "")
                last = contact.get("last_name", "")
                email = contact.get("email", "")
                linkedin = contact.get("linkedin_url", "")

                # Step 4a: Waterfall enrichment (only if no email)
                if not email and first and last:
                    result = enrichment.run_waterfall(first, last, domain, linkedin)
                    stats["total_cost"] += result.cost
                    if result.email:
                        email = result.email
                        stats["emails_verified"] += 1

                if not email:
                    continue

                # Upsert contact
                contact_row = supabase_client.upsert_contact(
                    email=email,
                    company_id=company_id,
                    first_name=first,
                    last_name=last,
                    title=contact.get("title"),
                    linkedin_url=linkedin or None,
                    source="a-leads",
                    source_id=biz.get("id") or domain,
                    enrichment_data={
                        "confidence_score": contact.get("confidence_score"),
                        "seniority": contact.get("seniority"),
                        "department": contact.get("department"),
                        "cell_code": cell_code,
                    },
                )
                contact_id = contact_row["id"]

                # Step 4b: Link to campaign (if cell is already live)
                if campaign_id:
                    supabase_client.link_contact_to_campaign(
                        contact_id=contact_id,
                        campaign_id=campaign_id,
                        client_id=client_id,
                    )

            time.sleep(0.2)  # Rate limiting

        stats["cells_processed"] += 1

    print(f"\n--- Summary ---")
    print(f"  Cells processed:   {stats['cells_processed']}/{len(cells)}")
    print(f"  Businesses found:  {stats['businesses_found']}")
    print(f"  Contacts found:    {stats['contacts_found']}")
    print(f"  Emails verified:   {stats['emails_verified']}")
    print(f"  Total cost:        ${stats['total_cost']:.2f}")

    # Step 5: Slack
    try:
        slack.send_message(
            f"✅ {client_code} | {stats['businesses_found']} bedrijven | "
            f"{stats['emails_verified']} verified | ${stats['total_cost']:.2f}"
        )
    except Exception as e:
        print(f"  WARN: Slack failed: {e}")

    return stats


def main():
    parser = argparse.ArgumentParser(description="GTM Campaign Orchestrator")
    sub = parser.add_subparsers(dest="command", required=True)

    create_p = sub.add_parser("create", help="Synthesize GTM strategy and create campaign cells")
    create_p.add_argument("--context", required=True, help="Path to context JSON (storage/orchestrations/CLIENT.json)")

    exec_p = sub.add_parser("execute", help="Run data pipeline for all cells of a client")
    exec_p.add_argument("--client-code", required=True, help="Client code (e.g. SECX)")

    args = parser.parse_args()

    from dotenv import load_dotenv
    load_dotenv(os.path.expanduser("~/.claude/.env"))
    load_dotenv(os.path.expanduser("~/ai-projects/business-os/.env"))

    if args.command == "create":
        ctx = load_context(args.context)
        result = create_campaign(ctx)
        print(json.dumps(result, indent=2))

    elif args.command == "execute":
        stats = execute_campaign(client_code=args.client_code)
        print(json.dumps(stats, indent=2))


if __name__ == "__main__":
    main()
