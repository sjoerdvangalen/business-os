#!/usr/bin/env python3
"""Score SECX test outputs for quality."""
import json, re, sys

path = "/Users/sjoerdvangalen/ai-projects/business-os/scripts/output/secx-test-v2-2026-04-20.json"
with open(path) as f:
    data = json.load(f)

# Employee mapping
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
    t = text.lower()
    # Skip very short names that cause substring false positives (e.g., "ia" in "via", "qu" in "requests")
    if len(c) <= 2:
        return False
    # Whole-word boundary match prevents "employ" in "employees", "engine" in "engineers"
    pattern = r'\b' + re.escape(c) + r'\b'
    if re.search(pattern, t):
        return True
    return False

def score_record(r):
    rec = r["rec"]
    bullets = r.get("bullets") or []
    issues = []
    score = 10

    # Basic checks
    if len(bullets) != 3:
        issues.append(f"Expected 3 bullets, got {len(bullets)}")
        score -= 3

    expected_emp = normalize_emp(rec.get("employees", ""))
    emp_used_count = 0
    total_words = 0

    for i, b in enumerate(bullets):
        w = count_words(b)
        total_words += w
        if w < 12 or w > 20:
            issues.append(f"B{i+1} word count {w} (expected 12-20)")
            score -= 1
        if not b.endswith("."):
            issues.append(f"B{i+1} missing period")
            score -= 0.5
        if expected_emp and expected_emp in b:
            emp_used_count += 1
        if contains_company_name(b, rec["company"]):
            issues.append(f"B{i+1} contains company name")
            score -= 1
        # invented percentages (allow verified SentioCX benchmarks)
        allowed_percentages = ["60%+", "76%"]
        if re.search(r"\d+%", b):
            if not any(p in b for p in allowed_percentages):
                issues.append(f"B{i+1} invented percentage")
                score -= 1
        # invented SLA targets with numbers
        if re.search(r"\d+\s*(seconds|minutes|hours|days|ms)", b, re.I):
            issues.append(f"B{i+1} invented time metric")
            score -= 1

    if emp_used_count == 0:
        issues.append("Employee scale number missing")
        score -= 1

    persona = rec.get("persona", "")

    # Persona-specific structure checks
    if persona == "cx" and len(bullets) >= 3:
        if not bullets[0].startswith("Connect"):
            issues.append("B1 should start with 'Connect'")
            score -= 1
        if not bullets[1].startswith("Route"):
            issues.append("B2 should start with 'Route'")
            score -= 1
        if not any(bullets[2].startswith(v) for v in ("Handle", "Scale", "Cut")):
            issues.append("B3 should start with Handle/Scale/Cut")
            score -= 1
        # B3 metric check: only one metric
        b3 = bullets[2]
        metrics = ["inquiry volume", "case volume", "patient volume", "escalation volume", "escalation backlog"]
        found = [m for m in metrics if m in b3.lower()]
        if len(found) > 1:
            issues.append(f"B3 has multiple metrics: {found}")
            score -= 1
        # B2 exactly two criteria -> exactly one 'and'
        b2 = bullets[1]
        ands = b2.lower().count(" and ")
        if ands != 1:
            issues.append(f"B2 has {ands} ' and ' occurrences (expected 1)")
            score -= 1

    elif persona == "csuite" and len(bullets) >= 3:
        if not bullets[0].startswith("Reduce"):
            issues.append("B1 should start with 'Reduce'")
            score -= 1
        if not bullets[1].startswith("Scale"):
            issues.append("B2 should start with 'Scale'")
            score -= 1
        if not bullets[2].startswith("Deliver"):
            issues.append("B3 should start with 'Deliver'")
            score -= 1
        # B2 exactly one constraint
        b2 = bullets[1]
        if b2.lower().count(" and ") + b2.lower().count(" or ") > 0:
            issues.append("B2 has multiple constraints")
            score -= 1
        # B3 exactly one unit
        b3 = bullets[2]
        units = ["per inquiry", "per case", "per contact", "per interaction", "per engagement"]
        found = [u for u in units if u in b3.lower()]
        if len(found) > 1:
            issues.append(f"B3 has multiple units: {found}")
            score -= 1

    elif persona == "ops" and len(bullets) >= 3:
        if not bullets[0].startswith("Send"):
            issues.append("B1 should start with 'Send'")
            score -= 1
        if not bullets[1].startswith("Route"):
            issues.append("B2 should start with 'Route'")
            score -= 1
        if not bullets[2].startswith("Improve"):
            issues.append("B3 should start with 'Improve'")
            score -= 1
        # B2 exactly one 'and'
        b2 = bullets[1]
        ands = b2.lower().count(" and ")
        if ands != 1:
            issues.append(f"B2 has {ands} ' and ' (expected 1)")
            score -= 1
        # B3 exactly one target and one constraint
        b3 = bullets[2]
        if b3.lower().count(" and ") + b3.lower().count(" or ") > 0:
            issues.append("B3 has multiple targets/constraints")
            score -= 1

    elif persona == "tech" and len(bullets) >= 3:
        if not bullets[0].startswith("Automate"):
            issues.append("B1 should start with 'Automate'")
            score -= 1
        if not bullets[1].startswith("Deploy"):
            issues.append("B2 should start with 'Deploy'")
            score -= 1
        if not bullets[2].startswith("Integrate"):
            issues.append("B3 should start with 'Integrate'")
            score -= 1
        # B2 exactly one capability and one constraint
        b2 = bullets[1]
        if b2.lower().count(" and ") + b2.lower().count(" or ") > 0:
            issues.append("B2 has multiple capabilities/constraints")
            score -= 1
        # B3 exactly one timeframe and one risk
        b3 = bullets[2]
        if b3.lower().count(" and ") + b3.lower().count(" or ") > 0:
            issues.append("B3 has multiple timeframes/risks")
            score -= 1

    # Cap at 10 min 0
    score = max(0, min(10, score))
    return score, issues

scores = []
for r in data:
    s, issues = score_record(r)
    scores.append(s)
    if s < 8 or issues:
        print(f"--- {r['rec']['company']} | {r['rec']['persona']} | score {s} ---")
        for b in r.get("bullets", []):
            print(f"  {b}")
        for issue in issues:
            print(f"  ! {issue}")
        print()

avg = sum(scores)/len(scores)
print(f"Average score: {avg:.2f}/10 over {len(scores)} records")
print(f"Scores distribution:")
for v in range(0, 11):
    c = scores.count(v)
    if c:
        print(f"  {v}: {c}")
