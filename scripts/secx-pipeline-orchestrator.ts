#!/usr/bin/env bun
/**
 * SECX Creative Ideas Campaign — Full Pipeline Orchestrator
 *
 * Phase 1: Import CSV → Supabase (contacts + companies)
 * Phase 2: Email Waterfall (verification + catchall detection)
 * Phase 3: EmailBison Campaign Create + Push
 *
 * Usage:
 *   SECX_CLIENT_ID=e0c5ea2c-f945-4ab5-a159-32b9dccdb9c5 \
 *   SECX_CSV_PATH=./output/secx-messaging-full-2026-04-20.csv \
 *   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
 *   bun secx-pipeline-orchestrator.ts --phase 1
 *
 * Then after Phase 1 completes:
 *   bun secx-pipeline-orchestrator.ts --phase 2
 *
 * Then after Phase 2 completes:
 *   bun secx-pipeline-orchestrator.ts --phase 3 --campaign-name "SECX | EN | Creative Ideas"
 */

import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { parse } from "csv-parse/sync";
import { readFileSync } from "fs";

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const RAILWAY_BATCH_WORKER_URL = process.env.RAILWAY_BATCH_WORKER_URL;
const CLIENT_ID = process.env.SECX_CLIENT_ID || "e0c5ea2c-f945-4ab5-a159-32b9dccdb9c5";
const CSV_PATH = process.env.SECX_CSV_PATH || "./output/secx-messaging-full-2026-04-20.csv";

const PHASE = process.argv.includes("--phase") ? parseInt(process.argv[process.argv.indexOf("--phase") + 1]) : 0;
const CAMPAIGN_NAME = process.argv.includes("--campaign-name") ? process.argv[process.argv.indexOf("--campaign-name") + 1] : "SECX | EN | Creative Ideas";
const DRY_RUN = process.argv.includes("--dry-run");
const BATCH_SIZE = 50;

interface CSVRecord {
  "First Name": string;
  "Last Name": string;
  "Work Email": string;
  "Job Title": string;
  Company: string;
  "Personal LinkedIn": string;
  "Company LinkedIn": string;
  Industries: string;
  "# Employees": string;
  "Company Keywords": string;
  Industry: string;
  Persona: string;
  Website: string;
  "Company Summary": string;
  Bullets: string;
}

// ─── Phase 1: Import ─────────────────────────────────────────────────────────

async function phase1Import(supabase: SupabaseClient) {
  console.log("[PHASE 1] Importing CSV to Supabase...");

  const raw = readFileSync(CSV_PATH, "utf-8");
  const records: CSVRecord[] = parse(raw, { columns: true, skip_empty_lines: true });
  console.log(`[INFO] Loaded ${records.length} records from CSV`);

  let companyUpserts = 0;
  let contactUpserts = 0;
  let skipped = 0;

  // Batch processing
  for (let i = 0; i < records.length; i += BATCH_SIZE) {
    const batch = records.slice(i, i + BATCH_SIZE);

    for (const rec of batch) {
      const email = rec["Work Email"]?.trim().toLowerCase();
      if (!email) {
        skipped++;
        continue;
      }

      const companyName = rec.Company?.trim();
      const domain = rec.Website?.trim().replace(/^https?:\/\//, "").split("/")[0] || null;

      // Upsert company
      let companyId: string | null = null;
      if (companyName) {
        const { data: existing } = await supabase
          .from("companies")
          .select("id")
          .eq("name", companyName)
          .eq("client_id", CLIENT_ID)
          .maybeSingle();

        if (existing) {
          companyId = existing.id;
        } else if (!DRY_RUN) {
          const { data: company, error } = await supabase
            .from("companies")
            .insert({
              client_id: CLIENT_ID,
              name: companyName,
              domain,
              website: rec.Website?.trim() || null,
              industry: rec.Industry?.trim() || null,
              employee_range: rec["# Employees"]?.trim() || null,
              source: "sentiox_creative_campaign",
            })
            .select("id")
            .single();

          if (error) {
            console.warn(`[WARN] Company insert failed for ${companyName}:`, error.message);
          } else {
            companyId = company?.id ?? null;
            companyUpserts++;
          }
        } else {
          companyUpserts++;
        }
      }

      // Upsert contact
      const firstName = rec["First Name"]?.trim();
      const lastName = rec["Last Name"]?.trim();

      const customVars: Record<string, any> = {};
      if (rec.Bullets?.trim()) {
        customVars.bullets = rec.Bullets.trim();
        customVars.persona = rec.Persona?.trim() || null;
        customVars.company_summary = rec["Company Summary"]?.trim() || null;
      }

      if (!DRY_RUN) {
        const { error } = await supabase
          .from("contacts")
          .upsert(
            {
              client_id: CLIENT_ID,
              company_id: companyId,
              email,
              first_name: firstName,
              last_name: lastName,
              full_name: `${firstName} ${lastName}`.trim(),
              position: rec["Job Title"]?.trim() || null,
              title: rec["Job Title"]?.trim() || null,
              linkedin_url: rec["Personal LinkedIn"]?.trim() || null,
              custom_variables: Object.keys(customVars).length > 0 ? customVars : null,
              source: "sentiox_creative_campaign",
              contact_status: "active",
            },
            { onConflict: "email" }
          );

        if (error) {
          console.warn(`[WARN] Contact upsert failed for ${email}:`, error.message);
        } else {
          contactUpserts++;
        }
      } else {
        contactUpserts++;
      }
    }

    console.log(`[PROGRESS] ${Math.min(i + BATCH_SIZE, records.length)}/${records.length} processed`);
  }

  console.log(`[DONE] Phase 1: ${companyUpserts} companies, ${contactUpserts} contacts, ${skipped} skipped`);
}

// ─── Phase 2: Email Waterfall ────────────────────────────────────────────────

async function phase2Waterfall(supabase: SupabaseClient) {
  console.log("[PHASE 2] Triggering email waterfall via Railway...");

  if (!RAILWAY_BATCH_WORKER_URL) {
    console.error("[ERROR] RAILWAY_BATCH_WORKER_URL not set");
    return;
  }

  // Get all contacts for this client that need verification
  const { data: contacts, error } = await supabase
    .from("contacts")
    .select("id, email, email_waterfall_status")
    .eq("client_id", CLIENT_ID)
    .or("email_waterfall_status.is.null,email_waterfall_status.eq.pending");

  if (error) {
    console.error("[ERROR] Failed to fetch contacts:", error.message);
    return;
  }

  console.log(`[INFO] ${contacts?.length || 0} contacts need email verification`);

  if (DRY_RUN) {
    console.log("[DRY RUN] Would trigger waterfall for", contacts?.length, "contacts");
    return;
  }

  // Batch via Railway — much more efficient than per-contact edge function calls
  const contactIds = (contacts || []).map(c => c.id);
  if (contactIds.length === 0) {
    console.log("[DONE] Phase 2: no contacts to process");
    return;
  }

  try {
    const res = await fetch(`${RAILWAY_BATCH_WORKER_URL}/waterfall`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        contact_ids: contactIds,
        client_id: CLIENT_ID,
        concurrency: 5,
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      console.error(`[ERROR] Waterfall batch failed:`, err);
      return;
    }

    const data = await res.json() as { found: number; failed: number; errors: number; dnc: number; duration_ms: number };
    console.log(`[DONE] Phase 2: found=${data.found} failed=${data.failed} errors=${data.errors} dnc=${data.dnc} time=${(data.duration_ms / 1000).toFixed(1)}s`);
  } catch (e) {
    console.error(`[ERROR] Waterfall exception:`, (e as Error).message);
  }
}

// ─── Phase 3: EmailBison Campaign + Push ─────────────────────────────────────

async function phase3CampaignAndPush(supabase: SupabaseClient) {
  console.log("[PHASE 3] Creating EmailBison campaign and pushing contacts...");

  if (DRY_RUN) {
    console.log("[DRY RUN] Would create campaign:", CAMPAIGN_NAME);
    return;
  }

  // Step 3a: Create campaign
  const campaignRes = await fetch(`${SUPABASE_URL}/functions/v1/emailbison-campaign-create`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      client_code: "SECX",
      campaign_name: CAMPAIGN_NAME,
      sequence_steps: [
        {
          order: 1,
          email_subject: "quick question about {company_name}",
          email_body: `Hi {first_name},

Saw {company_name} is using Salesforce Service Cloud. Had 3 ideas where SentioCX could likely help:

{bullets}

Any of these worth exploring?`,
          wait_in_days: 0,
          variant: false,
          thread_reply: false,
        },
      ],
      mode: "immediate",
    }),
  });

  if (!campaignRes.ok) {
    const err = await campaignRes.text();
    console.error("[ERROR] Campaign creation failed:", err);
    return;
  }

  const campaignData = await campaignRes.json();
  console.log("[INFO] Campaign created:", campaignData);

  const emailbisonCampaignId = campaignData.emailbison_campaign_id || campaignData.campaign?.id;
  if (!emailbisonCampaignId) {
    console.error("[ERROR] No campaign ID returned");
    return;
  }

  // Step 3b: Push verified contacts
  const { data: verifiedContacts, error } = await supabase
    .from("contacts")
    .select("id")
    .eq("client_id", CLIENT_ID)
    .eq("source", "sentiox_creative_campaign")
    .eq("email_verified", true)
    .not("email", "is", null);

  if (error) {
    console.error("[ERROR] Failed to fetch verified contacts:", error.message);
    return;
  }

  console.log(`[INFO] ${verifiedContacts?.length || 0} verified contacts ready to push`);

  // Get or create campaign in our DB
  const { data: campaign } = await supabase
    .from("campaigns")
    .select("id")
    .eq("provider_campaign_id", emailbisonCampaignId.toString())
    .maybeSingle();

  const campaignId = campaign?.id;

  if (!RAILWAY_BATCH_WORKER_URL) {
    console.error("[ERROR] RAILWAY_BATCH_WORKER_URL not set, cannot push");
    return;
  }

  // Push via Railway batch worker
  const pushRes = await fetch(`${RAILWAY_BATCH_WORKER_URL}/push`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      client_id: CLIENT_ID,
      emailbison_campaign_id: emailbisonCampaignId.toString(),
      campaign_id: campaignId,
      batch_size: 100,
    }),
  });

  if (!pushRes.ok) {
    const err = await pushRes.text();
    console.error("[ERROR] Push failed:", err);
    return;
  }

  const pushData = await pushRes.json();
  console.log("[DONE] Phase 3:", pushData);
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    console.error("[FATAL] Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
    process.exit(1);
  }

  if ((PHASE === 2 || PHASE === 3) && !RAILWAY_BATCH_WORKER_URL) {
    console.error("[FATAL] RAILWAY_BATCH_WORKER_URL required for phase 2 and 3");
    process.exit(1);
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  console.log(`[CONFIG] Client ID: ${CLIENT_ID}`);
  console.log(`[CONFIG] CSV Path: ${CSV_PATH}`);
  console.log(`[CONFIG] Dry Run: ${DRY_RUN}`);

  switch (PHASE) {
    case 1:
      await phase1Import(supabase);
      break;
    case 2:
      await phase2Waterfall(supabase);
      break;
    case 3:
      await phase3CampaignAndPush(supabase);
      break;
    default:
      console.log("Usage: bun secx-pipeline-orchestrator.ts --phase 1|2|3 [--dry-run] [--campaign-name \"...\"]");
      console.log("");
      console.log("Phase 1: Import CSV → Supabase (contacts + companies)");
      console.log("Phase 2: Email waterfall verification");
      console.log("Phase 3: EmailBison campaign create + push");
      process.exit(1);
  }
}

main().catch((err) => {
  console.error("[FATAL]", err.message);
  process.exit(1);
});
