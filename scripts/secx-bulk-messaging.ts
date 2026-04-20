#!/usr/bin/env bun
/**
 * SECX Bulk Messaging Generator
 * Runs 4 persona prompts against 6000 records, one output per record
 * Usage:
 *   bun run scripts/secx-bulk-messaging.ts                          # full run
 *   bun run scripts/secx-bulk-messaging.ts --dry-run --limit 10    # test 10 records
 *   bun run scripts/secx-bulk-messaging.ts --model gpt-4.1-mini    # use mini instead of nano
 *   bun run scripts/secx-bulk-messaging.ts --ab-test               # split 50/50 nano vs mini
 */

import { createClient } from "@supabase/supabase-js";
import OpenAI from "openai";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { join } from "path";

// --- Config ---

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY!;

const DEFAULT_MODEL = "gpt-5.4-nano";
const BATCH_SIZE = 20;
const PROMPTS_DIR = join(import.meta.dir, "secx-prompts");
const OUTPUT_DIR = join(import.meta.dir, "output");

const VALID_PERSONAS = ["cx", "ops", "tech", "csuite"] as const;
type Persona = (typeof VALID_PERSONAS)[number];

// --- Args ---

const args = process.argv.slice(2);
const isDryRun = args.includes("--dry-run");
const isABTest = args.includes("--ab-test");
const limitArg = args.find((a) => a.startsWith("--limit=") || a === "--limit");
const limitVal = limitArg?.includes("=")
  ? limitArg.split("=")[1]
  : args[args.indexOf("--limit") + 1];
const recordLimit = limitVal ? parseInt(limitVal) : undefined;
const modelArg = args.find((a) => a.startsWith("--model=") || a === "--model");
const modelVal = modelArg?.includes("=")
  ? modelArg.split("=")[1]
  : args[args.indexOf("--model") + 1];
const model = modelVal ?? DEFAULT_MODEL;

// --- Types ---

interface Record {
  contact_id: string;
  first_name: string | null;
  last_name: string | null;
  title: string | null;
  company_name: string;
  industry: string | null;
  employee_count: number | null;
  country: string | null;
  website: string | null;
  persona_key: Persona;
  vertical_key: string;
  customer_term: string | null;
  expert_term: string | null;
}

interface BulletOutput {
  bullets: [string, string, string];
}

interface OutputRecord {
  contact_id: string;
  persona_key: string;
  vertical_key: string;
  bullets: string[];
  model: string;
  generated_at: string;
}

// --- Prompt loader ---

const promptCache = new Map<Persona, string>();

function loadPrompt(persona: Persona): string {
  if (promptCache.has(persona)) return promptCache.get(persona)!;
  const path = join(PROMPTS_DIR, `prompt-${persona}.md`);
  const content = readFileSync(path, "utf-8");
  promptCache.set(persona, content);
  return content;
}

// --- Company context builder ---

function buildUserMessage(rec: Record): string {
  const parts: string[] = [];
  parts.push(`Company: ${rec.company_name}`);
  if (rec.industry) parts.push(`Industry: ${rec.industry}`);
  if (rec.employee_count) parts.push(`Employees: ${rec.employee_count.toLocaleString()}`);
  if (rec.country) parts.push(`Country: ${rec.country}`);
  if (rec.website) parts.push(`Website: ${rec.website}`);
  if (rec.customer_term) parts.push(`Customer term: ${rec.customer_term}`);
  if (rec.expert_term) parts.push(`Expert term: ${rec.expert_term}`);
  if (rec.title) parts.push(`Contact title: ${rec.title}`);
  return parts.join("\n");
}

// --- OpenAI call ---

async function generateBullets(
  client: OpenAI,
  rec: Record,
  targetModel: string
): Promise<BulletOutput | null> {
  const systemPrompt = loadPrompt(rec.persona_key);
  const userMessage = buildUserMessage(rec);

  try {
    const response = await client.chat.completions.create({
      model: targetModel,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userMessage },
      ],
      temperature: 0.3,
      max_completion_tokens: 400,
      response_format: { type: "json_object" },
    });

    const raw = response.choices[0]?.message?.content;
    if (!raw) return null;

    const parsed = JSON.parse(raw) as BulletOutput;
    if (
      !Array.isArray(parsed.bullets) ||
      parsed.bullets.length !== 3
    ) {
      console.warn(`[WARN] Malformed output for ${rec.contact_id} — skipping`);
      return null;
    }
    return parsed;
  } catch (err) {
    console.warn(`[WARN] API error for ${rec.contact_id}: ${(err as Error).message}`);
    return null;
  }
}

// --- Batch processor ---

async function processBatch(
  client: OpenAI,
  batch: Record[],
  targetModel: string
): Promise<OutputRecord[]> {
  const results = await Promise.all(
    batch.map(async (rec) => {
      const bullets = await generateBullets(client, rec, targetModel);
      if (!bullets) return null;
      return {
        contact_id: rec.contact_id,
        persona_key: rec.persona_key,
        vertical_key: rec.vertical_key,
        bullets: bullets.bullets,
        model: targetModel,
        generated_at: new Date().toISOString(),
      } satisfies OutputRecord;
    })
  );
  return results.filter((r): r is OutputRecord => r !== null);
}

// --- Supabase query ---

async function fetchRecords(supabase: ReturnType<typeof createClient>): Promise<Record[]> {
  const query = supabase
    .from("leads")
    .select(
      `
      contact_id,
      contacts!inner (
        first_name, last_name, title,
        companies!inner (
          name, industry, employee_count, country, website
        )
      ),
      campaign_cells!inner (
        persona_key, vertical_key,
        brief
      ),
      clients!inner (client_code)
    `
    )
    .eq("clients.client_code", "SECX")
    .not("contacts.email", "is", null)
    .not("campaign_cells.persona_key", "is", null)
    .not("campaign_cells.vertical_key", "is", null);

  if (recordLimit) query.limit(recordLimit);

  const { data, error } = await query;
  if (error) throw new Error(`Supabase query failed: ${error.message}`);

  return ((data as any[]) ?? []).map((row: any) => ({
    contact_id: row.contact_id,
    first_name: row.contacts?.first_name ?? null,
    last_name: row.contacts?.last_name ?? null,
    title: row.contacts?.title ?? null,
    company_name: row.contacts?.companies?.name ?? "Unknown",
    industry: row.contacts?.companies?.industry ?? null,
    employee_count: row.contacts?.companies?.employee_count ?? null,
    country: row.contacts?.companies?.country ?? null,
    website: row.contacts?.companies?.website ?? null,
    persona_key: row.campaign_cells?.persona_key as Persona,
    vertical_key: row.campaign_cells?.vertical_key ?? "generic",
    customer_term: row.campaign_cells?.brief?.customer_term ?? null,
    expert_term: row.campaign_cells?.brief?.expert_term ?? null,
  }));
}

// --- Main ---

async function main() {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !OPENAI_API_KEY) {
    console.error("[ERROR] Missing env vars. Run: source ~/.claude/scripts/load-env.sh");
    process.exit(1);
  }

  mkdirSync(OUTPUT_DIR, { recursive: true });

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const openai = new OpenAI({ apiKey: OPENAI_API_KEY });

  console.log(`[INFO] Fetching SECX records from Supabase...`);
  const records = await fetchRecords(supabase);
  console.log(`[INFO] Found ${records.length} records`);

  // Filter out unknown personas
  const valid = records.filter((r): r is Record & { persona_key: Persona } =>
    VALID_PERSONAS.includes(r.persona_key)
  );
  const skipped = records.length - valid.length;
  if (skipped > 0) console.warn(`[WARN] Skipped ${skipped} records with unknown persona`);

  if (isDryRun) {
    console.log(`[DRY-RUN] First record:`, JSON.stringify(valid[0], null, 2));
    console.log(`[DRY-RUN] Would process ${valid.length} records in batches of ${BATCH_SIZE}`);
    console.log(`[DRY-RUN] Model: ${model}`);
    return;
  }

  const dateStr = new Date().toISOString().split("T")[0];
  const outputFile = join(OUTPUT_DIR, `secx-messaging-${dateStr}.jsonl`);
  const errorFile = join(OUTPUT_DIR, `secx-messaging-${dateStr}-errors.jsonl`);

  let processed = 0;
  let errors = 0;
  const outputStream = Bun.file(outputFile).writer();

  console.log(`[INFO] Processing ${valid.length} records | model: ${model} | batch: ${BATCH_SIZE}`);
  console.log(`[INFO] Output: ${outputFile}`);

  for (let i = 0; i < valid.length; i += BATCH_SIZE) {
    const batch = valid.slice(i, i + BATCH_SIZE);

    // A/B test: split even batches on gpt-5.4-nano, odd on gpt-4.1-mini
    const batchModel =
      isABTest
        ? i % (BATCH_SIZE * 2) < BATCH_SIZE
          ? "gpt-5.4-nano"
          : "gpt-4.1-mini"
        : model;

    const results = await processBatch(openai, batch, batchModel);

    for (const result of results) {
      outputStream.write(JSON.stringify(result) + "\n");
    }

    processed += results.length;
    errors += batch.length - results.length;

    const pct = Math.round(((i + batch.length) / valid.length) * 100);
    process.stdout.write(
      `\r[INFO] ${i + batch.length}/${valid.length} (${pct}%) | ok: ${processed} | err: ${errors}`
    );
  }

  await outputStream.end();
  console.log(`\n[DONE] ${processed} records written to ${outputFile}`);
  if (errors > 0) console.warn(`[WARN] ${errors} records failed — check ${errorFile}`);
}

main().catch((err) => {
  console.error("[FATAL]", err.message);
  process.exit(1);
});
