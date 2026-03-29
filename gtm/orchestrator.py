#!/usr/bin/env python3
"""
GTM Campaign Orchestrator — end-to-end flow controller.

Usage:
  python orchestrator.py create --context context.json
  python orchestrator.py execute --campaign-id <uuid>

Phase A (create):
  Context JSON → Google Doc (Template B v2) → Slack notification → Supabase (status: review)

Phase B (execute):
  Campaign ID → A-Leads search → Contact discovery → Waterfall enrichment → Google Sheets → Slack
"""
import argparse
import json
import os
import sys
import time

sys.path.insert(0, os.path.dirname(__file__))

from lib import slack, aleads, enrichment

# Conditional Supabase (may not have SERVICE_ROLE_KEY yet)
HAS_SUPABASE = False
try:
    from lib import supabase_client
    HAS_SUPABASE = bool(os.environ.get("SUPABASE_SERVICE_ROLE_KEY"))
except Exception:
    pass

# Google API imports
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
    Phase A: Create campaign plan.
    1. Create Google Doc from Template B v2
    2. Send Slack notification
    3. Store in Supabase (if available)
    """
    client_code = context["client_code"]
    campaign_name = context["campaign_name"]

    print(f"Creating campaign: {campaign_name}")

    # Step 1: Create Google Doc
    doc_id, doc_url = None, None
    if HAS_GOOGLE:
        from create_template_b_v2 import create_template_b
        doc_id, doc_url = create_template_b(
            client_code=client_code,
            client_name=context.get("client_name", client_code),
            campaign_name=campaign_name,
        )
        print(f"  Google Doc created: {doc_url}")
    else:
        print("  SKIP: Google OAuth not configured, no doc created")

    # Step 2: Slack notification
    try:
        if doc_url:
            slack.notify_plan_ready(campaign_name, doc_url)
            print("  Slack notification sent")
        else:
            print("  SKIP: No doc URL for Slack notification")
    except Exception as e:
        print(f"  WARN: Slack failed: {e}")

    # Step 3: Store in Supabase
    campaign_id = None
    if HAS_SUPABASE:
        plan = supabase_client.create_campaign_plan(
            client_code=client_code,
            campaign_name=campaign_name,
            context=context,
            google_doc_id=doc_id,
            google_doc_url=doc_url,
        )
        campaign_id = plan["id"]
        print(f"  Supabase campaign_plans: {campaign_id}")
    else:
        print("  SKIP: Supabase not configured")

    result = {
        "campaign_name": campaign_name,
        "campaign_id": campaign_id,
        "google_doc_id": doc_id,
        "google_doc_url": doc_url,
        "status": "review",
    }

    print(f"\nCampaign plan created. Review het plan in Google Docs.")
    if campaign_id:
        print(f"Na approval, run: python orchestrator.py execute --campaign-id {campaign_id}")
    return result


def execute_campaign(campaign_id: str = None, context: dict = None) -> dict:
    """
    Phase B: Execute approved campaign.
    1. Load context (from Supabase or direct)
    2. A-Leads business search
    3. Contact discovery per business
    4. Waterfall enrichment per contact
    5. Export to Google Sheets
    6. Slack notification
    """
    # Load context
    if campaign_id and HAS_SUPABASE:
        plan = supabase_client.get_campaign_plan(campaign_id)
        context = plan["context"]
        supabase_client.update_campaign_status(campaign_id, "executing")
    elif not context:
        raise ValueError("Need either campaign_id (with Supabase) or context dict")

    campaign_name = context["campaign_name"]
    icp = context.get("icp", {})
    personas = context.get("personas", [])
    volume = context.get("volume", 100)

    print(f"Executing campaign: {campaign_name}")
    stats = {"businesses_found": 0, "contacts_found": 0, "emails_verified": 0, "total_cost": 0.0}

    # Step 1: A-Leads business search
    print("\n--- Step 1: Business search ---")
    search_params = {
        "industry": icp.get("industry", []),
        "headcount": icp.get("headcount", {}),
        "country": icp.get("country", []),
        "keywords_include": icp.get("keywords_include", []),
        "keywords_exclude": icp.get("keywords_exclude", []),
        "limit": volume,
    }
    businesses = aleads.search_businesses(search_params)
    stats["businesses_found"] = len(businesses)
    print(f"  Found {len(businesses)} businesses")

    if campaign_id and HAS_SUPABASE:
        supabase_client.append_execution_log(campaign_id, {
            "step": "business_search",
            "params": search_params,
            "count": len(businesses),
        })

    # Step 2: Contact discovery per business
    print("\n--- Step 2: Contact discovery ---")
    all_contacts = []
    job_titles = []
    for p in personas:
        job_titles.extend(p.get("keywords", []))

    for biz in businesses:
        domain = biz.get("domain", "")
        company_name = biz.get("name", "")
        if not domain:
            continue

        contacts = aleads.search_contacts(domain, company_name, max_results=3)
        for c in contacts:
            c["company_name"] = company_name
            c["company_domain"] = domain
        all_contacts.extend(contacts)
        time.sleep(0.2)  # Rate limiting

    stats["contacts_found"] = len(all_contacts)
    print(f"  Found {len(all_contacts)} contacts across {len(businesses)} businesses")

    # Step 3: Waterfall enrichment
    print("\n--- Step 3: Waterfall enrichment ---")
    enriched = []
    for i, contact in enumerate(all_contacts):
        first = contact.get("first_name", "")
        last = contact.get("last_name", "")
        domain = contact.get("company_domain", "")
        linkedin = contact.get("linkedin_url", "")

        if not (first and last and domain):
            continue

        result = enrichment.run_waterfall(first, last, domain, linkedin)
        stats["total_cost"] += result.cost

        row = {
            "company_name": contact.get("company_name", ""),
            "domain": domain,
            "first_name": first,
            "last_name": last,
            "email": result.email or "",
            "source": result.source,
            "method": result.method,
        }
        enriched.append(row)

        if result.email:
            stats["emails_verified"] += 1

        if (i + 1) % 10 == 0:
            print(f"  Processed {i + 1}/{len(all_contacts)} contacts...")

    print(f"  Enriched: {stats['emails_verified']}/{len(all_contacts)} verified emails")
    print(f"  Total cost: ${stats['total_cost']:.4f}")

    # Step 4: Export to Google Sheets
    sheet_url = None
    if HAS_GOOGLE and enriched:
        print("\n--- Step 4: Export to Google Sheets ---")
        try:
            from lib.google_sheets import create_prospect_export
            sheet_id, sheet_url = create_prospect_export(campaign_name, enriched)
            stats["sheet_url"] = sheet_url
            print(f"  Google Sheet: {sheet_url}")
        except Exception as e:
            print(f"  WARN: Google Sheets export failed: {e}")
            # Fallback: save as CSV
            _save_csv(campaign_name, enriched)
    elif enriched:
        _save_csv(campaign_name, enriched)

    # Step 5: Slack notification
    try:
        slack.notify_campaign_complete(campaign_name, {
            "Businesses": stats["businesses_found"],
            "Contacts": stats["contacts_found"],
            "Verified emails": stats["emails_verified"],
            "Cost": f"${stats['total_cost']:.2f}",
            "sheet_url": sheet_url,
        })
        print("\n  Slack notification sent")
    except Exception as e:
        print(f"\n  WARN: Slack notification failed: {e}")

    # Step 6: Update Supabase
    if campaign_id and HAS_SUPABASE:
        supabase_client.update_campaign_status(
            campaign_id, "completed",
            stats=stats,
            google_sheet_url=sheet_url,
        )

    print(f"\nCampaign {campaign_name} complete!")
    return stats


def _save_csv(campaign_name: str, rows: list[dict]):
    import csv
    filename = f"{campaign_name.lower().replace(' ', '_')}_export.csv"
    path = os.path.join(os.path.dirname(__file__), filename)
    if not rows:
        return
    with open(path, "w", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=rows[0].keys())
        writer.writeheader()
        writer.writerows(rows)
    print(f"  CSV saved: {path}")


def main():
    parser = argparse.ArgumentParser(description="GTM Campaign Orchestrator")
    sub = parser.add_subparsers(dest="command", required=True)

    # create
    create_p = sub.add_parser("create", help="Create a campaign plan")
    create_p.add_argument("--context", required=True, help="Path to context JSON file")

    # execute
    exec_p = sub.add_parser("execute", help="Execute an approved campaign")
    exec_p.add_argument("--campaign-id", help="Supabase campaign plan UUID")
    exec_p.add_argument("--context", help="Direct context JSON (if no Supabase)")

    args = parser.parse_args()

    # Load env
    from dotenv import load_dotenv
    load_dotenv(os.path.expanduser("~/.claude/.env"))
    load_dotenv(os.path.expanduser("~/ai-projects/business-os/.env"))

    if args.command == "create":
        ctx = load_context(args.context)
        result = create_campaign(ctx)
        print(json.dumps(result, indent=2))

    elif args.command == "execute":
        ctx = load_context(args.context) if args.context else None
        stats = execute_campaign(campaign_id=args.campaign_id, context=ctx)
        print(json.dumps(stats, indent=2))


if __name__ == "__main__":
    main()
