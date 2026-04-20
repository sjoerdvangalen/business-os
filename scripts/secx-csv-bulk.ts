#!/usr/bin/env bun
/**
 * SECX CSV Bulk Messaging Generator
 * Processes all valid records from the SentioCX CSV in batched parallel calls.
 * Usage:
 *   bun run scripts/secx-csv-bulk.ts
 *   bun run scripts/secx-csv-bulk.ts --limit 100
 */
import { readFileSync, writeFileSync, existsSync, appendFileSync } from "fs";
import { join } from "path";
import OpenAI from "openai";

const OPENAI_API_KEY = process.env.OPENAI_API_KEY!;
const PROMPTS_DIR = join(import.meta.dir, "secx-prompts");
const CSV_PATH = "/Users/sjoerdvangalen/Downloads/Untitled spreadsheet - SentioCX-or-Creative-Campaign-Default-view-export-1776689499547 (1).csv";
const OUTPUT_DIR = join(import.meta.dir, "output");
const BATCH_SIZE = 50;
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 500;

const VALID_PERSONAS = ["cx", "ops", "tech", "csuite"] as const;
type Persona = (typeof VALID_PERSONAS)[number];

interface Record {
  first_name: string;
  last_name: string;
  email: string;
  title: string;
  company: string;
  industry: string;
  employees: string;
  persona: Persona;
  website: string;
  summary: string;
}

interface Result {
  email: string;
  company: string;
  persona: Persona;
  industry: string;
  employees: string;
  bullets: string[];
  generated_at: string;
}

// --- Args ---
const args = process.argv.slice(2);
const limitArg = args.find((a) => a.startsWith("--limit="));
const recordLimit = limitArg ? parseInt(limitArg.split("=")[1]) : undefined;

// --- CSV Parser ---
function parseCSV(path: string): Record[] {
  const raw = readFileSync(path, "utf-8").trim();
  const lines = raw.split("\n");
  const records: Record[] = [];
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    const cols: string[] = [];
    let current = "";
    let inQuotes = false;
    for (let j = 0; j < line.length; j++) {
      const char = line[j];
      if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === ',' && !inQuotes) {
        cols.push(current.trim().replace(/^"|"$/g, ""));
        current = "";
      } else {
        current += char;
      }
    }
    cols.push(current.trim().replace(/^"|"$/g, ""));
    if (cols.length < 14) continue;
    const personaRaw = cols[11].toLowerCase().trim();
    const persona = VALID_PERSONAS.find((p) => personaRaw.includes(p)) as Persona | undefined;
    if (!persona) continue;
    records.push({
      first_name: cols[0],
      last_name: cols[1],
      email: cols[2],
      title: cols[3],
      company: cols[4],
      industry: cols[10],
      employees: cols[8],
      persona,
      website: cols[12],
      summary: cols[13],
    });
  }
  return records;
}

function buildUserMessage(rec: Record): string {
  const parts: string[] = [];
  parts.push(`Company: ${rec.company}`);
  parts.push(`Industry: ${rec.industry}`);
  parts.push(`Employees: ${rec.employees}`);
  if (rec.website) parts.push(`Website: ${rec.website}`);
  if (rec.title) parts.push(`Contact title: ${rec.title}`);
  if (rec.summary) parts.push(`Company summary: ${rec.summary}`);
  return parts.join("\n");
}

const promptCache = new Map<Persona, string>();
function loadPrompt(persona: Persona): string {
  if (promptCache.has(persona)) return promptCache.get(persona)!;
  const content = readFileSync(join(PROMPTS_DIR, `prompt-${persona}.md`), "utf-8");
  promptCache.set(persona, content);
  return content;
}

interface TokenUsage {
  prompt_tokens: number;
  completion_tokens: number;
  cached_tokens: number;
}

async function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function generateBullets(
  client: OpenAI,
  rec: Record,
  attempt = 1
): Promise<{ bullets: string[] | null; usage: TokenUsage | null }> {
  const systemPrompt = loadPrompt(rec.persona);
  const userMessage = buildUserMessage(rec);
  try {
    const response = await client.chat.completions.create({
      model: "gpt-5.4-nano",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userMessage },
      ],
      temperature: 0.3,
      max_completion_tokens: 400,
      response_format: { type: "json_object" },
    });
    const usage: TokenUsage = {
      prompt_tokens: response.usage?.prompt_tokens ?? 0,
      completion_tokens: response.usage?.completion_tokens ?? 0,
      cached_tokens: (response.usage as any)?.prompt_tokens_details?.cached_tokens ?? 0,
    };
    const raw = response.choices[0]?.message?.content;
    if (!raw) return { bullets: null, usage };
    const parsed = JSON.parse(raw) as { bullets?: string[] };
    if (!Array.isArray(parsed.bullets) || parsed.bullets.length !== 3) {
      console.warn(`[WARN] Malformed output for ${rec.email}`);
      return { bullets: null, usage };
    }
    return { bullets: parsed.bullets, usage };
  } catch (err) {
    const msg = (err as Error).message;
    if (attempt < MAX_RETRIES && (msg.includes("429") || msg.includes("timeout") || msg.includes("ECONNRESET"))) {
      const delay = RETRY_DELAY_MS * Math.pow(2, attempt - 1);
      console.warn(`[RETRY ${attempt}/${MAX_RETRIES}] ${rec.email} — waiting ${delay}ms`);
      await sleep(delay);
      return generateBullets(client, rec, attempt + 1);
    }
    console.warn(`[WARN] API error for ${rec.email}: ${msg}`);
    return { bullets: null, usage: null };
  }
}

function getExistingEmails(outputPath: string): Set<string> {
  const set = new Set<string>();
  if (!existsSync(outputPath)) return set;
  const lines = readFileSync(outputPath, "utf-8").trim().split("\n");
  for (const line of lines) {
    if (!line.trim()) continue;
    try {
      const obj = JSON.parse(line) as Result;
      if (obj.email) set.add(obj.email);
    } catch {}
  }
  return set;
}

async function main() {
  if (!OPENAI_API_KEY) {
    console.error("[ERROR] Missing OPENAI_API_KEY");
    process.exit(1);
  }

  const records = parseCSV(CSV_PATH);
  console.log(`[INFO] Loaded ${records.length} valid records from CSV`);

  const targetRecords = recordLimit ? records.slice(0, recordLimit) : records;

  const dateStr = new Date().toISOString().split("T")[0];
  const outputFile = join(OUTPUT_DIR, `secx-messaging-csv-${dateStr}.jsonl`);
  const errorFile = join(OUTPUT_DIR, `secx-messaging-csv-${dateStr}-errors.jsonl`);
  const csvFile = join(OUTPUT_DIR, `secx-messaging-csv-${dateStr}.csv`);

  if (!existsSync(OUTPUT_DIR)) {
    import("fs").then((fs) => fs.mkdirSync(OUTPUT_DIR, { recursive: true }));
  }

  // CSV helpers
  function csvEscape(val: string): string {
    if (val.includes(",") || val.includes('"') || val.includes("\n")) {
      return `"${val.replace(/"/g, '""')}"`;
    }
    return val;
  }
  function csvHeader(): string {
    return "company,persona,industry,employees,email,title,bullets\n";
  }
  function csvRow(rec: Record, bullets: string[]): string {
    const bulletCell = bullets.map((b) => `- ${b}`).join("\n");
    return [
      csvEscape(rec.company),
      csvEscape(rec.persona),
      csvEscape(rec.industry),
      csvEscape(rec.employees),
      csvEscape(rec.email),
      csvEscape(rec.title),
      csvEscape(bulletCell),
    ].join(",") + "\n";
  }
  // Write CSV header if starting fresh
  if (!existsSync(csvFile)) {
    writeFileSync(csvFile, csvHeader());
  }

  const existing = getExistingEmails(outputFile);
  if (existing.size > 0) {
    console.log(`[INFO] Resuming — skipping ${existing.size} already processed records`);
  }

  const toProcess = targetRecords.filter((r) => !existing.has(r.email));
  console.log(`[INFO] Processing ${toProcess.length} records | batch: ${BATCH_SIZE}`);

  const client = new OpenAI({ apiKey: OPENAI_API_KEY });
  let processed = 0;
  let errors = 0;
  let totalPrompt = 0;
  let totalCompletion = 0;
  let totalCached = 0;
  const startTime = Date.now();

  for (let i = 0; i < toProcess.length; i += BATCH_SIZE) {
    const batch = toProcess.slice(i, i + BATCH_SIZE);
    const results = await Promise.all(
      batch.map(async (rec) => {
        const { bullets, usage } = await generateBullets(client, rec);
        return { rec, bullets, usage };
      })
    );

    for (const { rec, bullets, usage } of results) {
      if (bullets) {
        const result: Result = {
          email: rec.email,
          company: rec.company,
          persona: rec.persona,
          industry: rec.industry,
          employees: rec.employees,
          bullets,
          generated_at: new Date().toISOString(),
        };
        appendFileSync(outputFile, JSON.stringify(result) + "\n");
        appendFileSync(csvFile, csvRow(rec, bullets));
        processed++;
      } else {
        appendFileSync(errorFile, JSON.stringify({ email: rec.email, company: rec.company, at: new Date().toISOString() }) + "\n");
        errors++;
      }
      if (usage) {
        totalPrompt += usage.prompt_tokens;
        totalCompletion += usage.completion_tokens;
        totalCached += usage.cached_tokens;
      }
    }

    const pct = Math.round(((i + batch.length) / toProcess.length) * 100);
    const elapsed = (Date.now() - startTime) / 1000;
    const rps = processed / elapsed;
    const eta = rps > 0 ? Math.round((toProcess.length - i - batch.length) / rps) : 0;
    process.stdout.write(`\r[INFO] ${i + batch.length}/${toProcess.length} (${pct}%) | ok: ${processed} | err: ${errors} | ${rps.toFixed(1)}/s | ETA ${eta}s`);
  }

  const elapsedTotal = (Date.now() - startTime) / 1000;
  const uncached = totalPrompt - totalCached;
  const costUncached = (uncached / 1_000_000) * 0.20;
  const costCached = (totalCached / 1_000_000) * 0.02;
  const costCompletion = (totalCompletion / 1_000_000) * 1.25;
  const totalCost = costUncached + costCached + costCompletion;

  console.log(`\n[DONE] ${processed} records written to ${outputFile}`);
  console.log(`[SPEED] ${elapsedTotal.toFixed(1)}s total | ${(processed / elapsedTotal).toFixed(1)} records/sec`);
  console.log(`[TOKENS] prompt=${totalPrompt} cached=${totalCached} completion=${totalCompletion}`);
  console.log(`[COST] $${totalCost.toFixed(4)} total | $${(totalCost / processed).toFixed(5)} per record`);
  if (errors > 0) console.warn(`[WARN] ${errors} errors logged to ${errorFile}`);
}

main().catch((err) => {
  console.error("[FATAL]", err.message);
  process.exit(1);
});
