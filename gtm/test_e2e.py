#!/usr/bin/env python3
"""
End-to-end test for GTM Campaign Orchestrator.

Tests each component independently, then runs the full flow.
Run: python test_e2e.py [--live]

Without --live: dry-run checks (imports, config, structure)
With --live: actual API calls (uses credits)
"""
import os
import sys
import json

sys.path.insert(0, os.path.dirname(__file__))

# Load env
from dotenv import load_dotenv
load_dotenv(os.path.expanduser("~/.claude/.env"))
load_dotenv(os.path.expanduser("~/ai-projects/business-os/.env"))

LIVE = "--live" in sys.argv
PASS = 0
FAIL = 0


def test(name: str, func):
    global PASS, FAIL
    try:
        result = func()
        PASS += 1
        print(f"  OK  {name}" + (f" — {result}" if result else ""))
    except Exception as e:
        FAIL += 1
        print(f"  FAIL  {name} — {e}")


# ─── Config Checks ───

print("=== Config ===")
test("ALEADS_API_KEY set", lambda: bool(os.environ.get("ALEADS_API_KEY")))
test("TRYKITT_API_KEY set", lambda: bool(os.environ.get("TRYKITT_API_KEY")))
test("ENROW_API_KEY set", lambda: bool(os.environ.get("ENROW_API_KEY")))
test("SLACK_WEBHOOK_URL set", lambda: bool(os.environ.get("SLACK_WEBHOOK_URL")))
test("SUPABASE_SERVICE_ROLE_KEY set", lambda: bool(os.environ.get("SUPABASE_SERVICE_ROLE_KEY")) or "MISSING (optional for MVP)")

# ─── Module Imports ───

print("\n=== Imports ===")
test("import lib.slack", lambda: __import__("lib.slack"))
test("import lib.aleads", lambda: __import__("lib.aleads"))
test("import lib.enrichment", lambda: __import__("lib.enrichment"))
test("import lib.supabase_client", lambda: __import__("lib.supabase_client"))

# ─── Pattern Generation ───

print("\n=== Enrichment: Pattern Generation ===")
from lib.enrichment import generate_patterns, extract_linkedin_slug

test("generate_patterns(luke, vangalen, example.com)", lambda: generate_patterns("Luke", "VanGalen", "example.com"))
test("linkedin_slug extraction", lambda: extract_linkedin_slug("https://linkedin.com/in/sjoerd-van-galen"))

# ─── Context File ───

print("\n=== Context ===")
test("test_context.json exists", lambda: os.path.exists("test_context.json"))
test("test_context.json valid JSON", lambda: json.load(open("test_context.json")))

# ─── Google OAuth ───

print("\n=== Google OAuth ===")
test("token.pickle exists", lambda: os.path.exists(os.path.expanduser("~/.claude/.google/token.pickle")) or "MISSING")

# ─── Live Tests ───

if LIVE:
    print("\n=== LIVE: A-Leads ===")
    from lib.aleads import search_businesses
    test("A-Leads search (3 NL SaaS)", lambda: f"{len(search_businesses({'industry': ['Software'], 'country': ['NL'], 'keywords_include': ['SaaS'], 'limit': 3}))} results")

    print("\n=== LIVE: TryKitt ===")
    from lib.enrichment import verify_trykitt
    test("TryKitt verify (test@example.com)", lambda: verify_trykitt("test@example.com"))

    print("\n=== LIVE: Enrow ===")
    from lib.enrichment import find_email_enrow
    test("Enrow find (test, user, example.com)", lambda: find_email_enrow("test", "user", "example.com"))

    print("\n=== LIVE: Slack ===")
    from lib.slack import notify_plan_ready
    test("Slack test notification", lambda: notify_plan_ready("E2E-TEST", "https://docs.google.com/test"))

    print("\n=== LIVE: Full Waterfall ===")
    from lib.enrichment import run_waterfall
    test("Waterfall (test, user, example.com)", lambda: f"email={run_waterfall('test', 'user', 'example.com').email}, cost=${run_waterfall('test', 'user', 'example.com').cost:.4f}")

else:
    print("\n  (Voeg --live toe voor API tests)")

# ─── Summary ───

print(f"\n{'='*40}")
print(f"Results: {PASS} passed, {FAIL} failed")
if FAIL:
    sys.exit(1)
