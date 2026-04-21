#!/usr/bin/env python3
"""Merge original CSV with bullets from JSONL, keeping all original columns."""
import csv, json

jsonl_path = "/Users/sjoerdvangalen/ai-projects/business-os/scripts/output/secx-messaging-csv-2026-04-20.jsonl"
csv_path = "/Users/sjoerdvangalen/Downloads/Untitled spreadsheet - SentioCX-or-Creative-Campaign-Default-view-export-1776689499547 (1).csv"
out_path = "/Users/sjoerdvangalen/ai-projects/business-os/scripts/output/secx-messaging-full-2026-04-20.csv"

# Load bullets from JSONL
bullets_by_email = {}
with open(jsonl_path) as f:
    for line in f:
        obj = json.loads(line.strip())
        email = obj.get("email", "").lower().strip()
        bullets_by_email[email] = obj.get("bullets", ["", "", ""])

# Read original CSV and merge
with open(csv_path, "r", encoding="utf-8") as fin, open(out_path, "w", encoding="utf-8", newline="") as fout:
    reader = csv.DictReader(fin)
    fieldnames = reader.fieldnames + ["Bullets"]
    writer = csv.DictWriter(fout, fieldnames=fieldnames)
    writer.writeheader()

    matched = 0
    unmatched = 0
    for row in reader:
        email = row.get("Work Email", "").lower().strip()
        b = bullets_by_email.get(email, ["", "", ""])
        if email in bullets_by_email:
            matched += 1
        else:
            unmatched += 1
        # Format bullets as markdown list in single cell
        bullet_lines = [f"- {b[i]}" for i in range(len(b)) if b[i]]
        row["Bullets"] = "\n".join(bullet_lines)
        writer.writerow(row)

print(f"[DONE] Wrote {out_path}")
print(f"Matched: {matched} | Unmatched: {unmatched} | Total: {matched + unmatched}")
