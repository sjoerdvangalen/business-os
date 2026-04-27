#!/usr/bin/env bun
import { readFileSync } from "fs";
import { join } from "path";
import OpenAI from "openai";

const OPENAI_API_KEY = process.env.OPENAI_API_KEY!;
const PROMPTS_DIR = join(import.meta.dir, "secx-prompts");
const CSV_PATH = "/Users/sjoerdvangalen/Downloads/SentioCX-or-Creative-Campaign-Default-view-export-1776689499547.csv";

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

function parseCSV(path: string): Record[] {
  const raw = readFileSync(path, "utf-8").trim();
  const lines = raw.split("\n");
  const headers = lines[0].split(",").map((h) => h.trim().replace(/^"|"$/g, ""));
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
    if (cols.length < 16) continue;
    const personaRaw = cols[12].toLowerCase().trim();
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
      website: cols[13],
      summary: cols[15],
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

function loadPrompt(persona: Persona): string {
  const path = join(PROMPTS_DIR, `prompt-${persona}.md`);
  return readFileSync(path, "utf-8");
}

interface TokenUsage {
  prompt_tokens: number;
  completion_tokens: number;
  cached_tokens: number;
}

async function generateBullets(
  client: OpenAI,
  rec: Record
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
      console.warn(`[WARN] Malformed output for ${rec.email} — skipping`);
      return { bullets: null, usage };
    }
    return { bullets: parsed.bullets, usage };
  } catch (err) {
    console.warn(`[WARN] API error for ${rec.email}: ${(err as Error).message}`);
    return { bullets: null, usage: null };
  }
}

async function main() {
  if (!OPENAI_API_KEY) {
    console.error("[ERROR] Missing OPENAI_API_KEY");
    process.exit(1);
  }

  const records = parseCSV(CSV_PATH);
  console.log(`[INFO] Loaded ${records.length} valid records from CSV`);

  // Only first 10 OPS records
  const opsRecords = records.filter((r) => r.persona === "ops").slice(0, 50);
  console.log(`[INFO] Testing ${opsRecords.length} OPS records`);

  const openai = new OpenAI({ apiKey: OPENAI_API_KEY });

  const results: { rec: Record; bullets: string[] | null; usage: TokenUsage | null }[] = [];
  let totalPrompt = 0;
  let totalCompletion = 0;
  let totalCached = 0;

  for (const rec of opsRecords) {
    console.log(`\n[TEST] ${rec.company} | ${rec.persona} | ${rec.title}`);
    console.log(`[INPUT] ${rec.employees} | ${rec.industry}`);
    console.log(`[SUMMARY] ${rec.summary.slice(0, 120)}...`);
    const { bullets, usage } = await generateBullets(openai, rec);
    if (bullets) {
      bullets.forEach((b, i) => console.log(`  B${i + 1}: ${b}`));
    }
    if (usage) {
      totalPrompt += usage.prompt_tokens;
      totalCompletion += usage.completion_tokens;
      totalCached += usage.cached_tokens;
      console.log(`  [TOKENS] prompt=${usage.prompt_tokens} completion=${usage.completion_tokens} cached=${usage.cached_tokens}`);
    }
    results.push({ rec, bullets, usage });
  }

  const uncachedPrompt = totalPrompt - totalCached;
  const costUncached = (uncachedPrompt / 1_000_000) * 0.20;
  const costCached = (totalCached / 1_000_000) * 0.02;
  const costCompletion = (totalCompletion / 1_000_000) * 1.25;
  const totalCost = costUncached + costCached + costCompletion;

  console.log(`\n=== TOKEN SUMMARY ===`);
  console.log(`Total prompt tokens:    ${totalPrompt}`);
  console.log(`Total cached tokens:    ${totalCached}`);
  console.log(`Total uncached tokens:  ${uncachedPrompt}`);
  console.log(`Total completion tokens: ${totalCompletion}`);
  console.log(`Cost uncached input:    $${costUncached.toFixed(4)}`);
  console.log(`Cost cached input:      $${costCached.toFixed(4)}`);
  console.log(`Cost output:            $${costCompletion.toFixed(4)}`);
  console.log(`TOTAL COST:             $${totalCost.toFixed(4)}`);
  console.log(`Cost per record:        $${(totalCost / opsRecords.length).toFixed(5)}`);

  const dateStr = new Date().toISOString().split("T")[0];
  const outPath = join(import.meta.dir, "output", `secx-test-ops-v3-${dateStr}.json`);
  const csvPath = join(import.meta.dir, "output", `secx-test-ops-v3-${dateStr}.csv`);
  const fs = await import("fs");
  fs.mkdirSync(join(import.meta.dir, "output"), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(results, null, 2));

  function csvEscape(val: string): string {
    if (val.includes(",") || val.includes('"') || val.includes("\n")) {
      return `"${val.replace(/"/g, '""')}"`;
    }
    return val;
  }
  const csvLines: string[] = [];
  csvLines.push("company,persona,industry,employees,email,title,bullets");
  for (const { rec, bullets } of results) {
    const bulletCell = bullets ? bullets.map((b) => `- ${b}`).join("\n") : "";
    csvLines.push(
      [
        csvEscape(rec.company),
        csvEscape(rec.persona),
        csvEscape(rec.industry),
        csvEscape(rec.employees),
        csvEscape(rec.email),
        csvEscape(rec.title),
        csvEscape(bulletCell),
      ].join(",")
    );
  }
  fs.writeFileSync(csvPath, csvLines.join("\n"));
  console.log(`\n[DONE] JSON: ${outPath}`);
  console.log(`[DONE] CSV:  ${csvPath}`);
}

main().catch((err) => {
  console.error("[FATAL]", err.message);
  process.exit(1);
});
