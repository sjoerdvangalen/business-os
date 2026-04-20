#!/usr/bin/env python3
import json, re

path = "/Users/sjoerdvangalen/ai-projects/business-os/scripts/output/secx-messaging-csv-2026-04-20.jsonl"

emp_map = {
    "201-500": "200+",
    "501-1000": "500+",
    "1001-5000": "1,000+",
    "5001-10000": "5,000+",
}

def normalize_emp(s):
    s = s.replace(",", "").replace(" employees", "").strip()
    return emp_map.get(s, s)

def count_words(text):
    return len(text.split())

def contains_company_name(text, company):
    c = company.lower()
    if len(c) <= 2:
        return False
    pattern = r'\b' + re.escape(c) + r'\b'
    return bool(re.search(pattern, text.lower()))

def score_record(r):
    rec = r
    bullets = r.get("bullets") or []
    score = 10
    issues = []
    company = rec["company"].lower()
    expected_emp = normalize_emp(rec.get("employees", ""))
    emp_used = 0

    if len(bullets) != 3:
        score -= 3
        issues.append("not 3 bullets")

    for i, b in enumerate(bullets):
        w = len(b.split())
        if w < 12 or w > 20:
            score -= 1
            issues.append(f"B{i+1} wc={w}")
        if not b.endswith("."):
            score -= 0.5
            issues.append(f"B{i+1} no period")
        if expected_emp and expected_emp in b:
            emp_used += 1
        if contains_company_name(b, rec["company"]):
            score -= 1
            issues.append(f"B{i+1} company name")
        if re.search(r"\d+%", b) and not any(p in b for p in ["60%+", "76%"]):
            score -= 1
            issues.append(f"B{i+1} invented %")
        if re.search(r"\d+\s*(seconds|minutes|hours|days|ms)", b, re.I):
            score -= 1
            issues.append(f"B{i+1} invented time")

    if emp_used == 0:
        score -= 1
        issues.append("emp missing")

    persona = rec.get("persona", "")
    if persona == "cx" and len(bullets) >= 3:
        if not bullets[0].startswith("Connect"): score-=1; issues.append("B1 not Connect")
        if not bullets[1].startswith("Route"): score-=1; issues.append("B2 not Route")
        if not any(bullets[2].startswith(v) for v in ("Handle","Scale","Cut")): score-=1; issues.append("B3 not Handle/Scale/Cut")
        b3 = bullets[2]
        metrics = ["inquiry volume","case volume","patient volume","escalation volume","escalation backlog"]
        found = [m for m in metrics if m in b3.lower()]
        if len(found) > 1: score-=1; issues.append(f"B3 multi metrics {found}")
        b2 = bullets[1]
        if b2.lower().count(" and ") != 1: score-=1; issues.append(f"B2 and count !=1")
    elif persona == "csuite" and len(bullets) >= 3:
        if not bullets[0].startswith("Reduce"): score-=1; issues.append("B1 not Reduce")
        if not bullets[1].startswith("Scale"): score-=1; issues.append("B2 not Scale")
        if not bullets[2].startswith("Deliver"): score-=1; issues.append("B3 not Deliver")
        b2 = bullets[1]
        if b2.lower().count(" and ") + b2.lower().count(" or ") > 0: score-=1; issues.append("B2 multi constraints")
        b3 = bullets[2]
        units = ["per inquiry","per case","per contact","per interaction","per engagement"]
        found = [u for u in units if u in b3.lower()]
        if len(found) > 1: score-=1; issues.append(f"B3 multi units {found}")
    elif persona == "ops" and len(bullets) >= 3:
        if not bullets[0].startswith("Send"): score-=1; issues.append("B1 not Send")
        if not bullets[1].startswith("Route"): score-=1; issues.append("B2 not Route")
        if not bullets[2].startswith("Improve"): score-=1; issues.append("B3 not Improve")
        b2 = bullets[1]
        if b2.lower().count(" and ") != 1: score-=1; issues.append("B2 and count !=1")
        b3 = bullets[2]
        if b3.lower().count(" and ") + b3.lower().count(" or ") > 0: score-=1; issues.append("B3 multi targets")
    elif persona == "tech" and len(bullets) >= 3:
        if not bullets[0].startswith("Automate"): score-=1; issues.append("B1 not Automate")
        if not bullets[1].startswith("Deploy"): score-=1; issues.append("B2 not Deploy")
        if not bullets[2].startswith("Integrate"): score-=1; issues.append("B3 not Integrate")
        b2 = bullets[1]
        if b2.lower().count(" and ") + b2.lower().count(" or ") > 0: score-=1; issues.append("B2 multi cap/constraints")
        b3 = bullets[2]
        if b3.lower().count(" and ") + b3.lower().count(" or ") > 0: score-=1; issues.append("B3 multi time/risk")

    score = max(0, min(10, score))
    return score, issues

with open(path) as f:
    for line in f:
        obj = json.loads(line.strip())
        s, issues = score_record(obj)
        if s == 9:
            print(f"=== {obj['company']} | {obj['persona']} | {obj['employees']} ===")
            for b in obj.get("bullets", []):
                print(f"  {b}")
            print(f"  issues: {issues}")
            print()
