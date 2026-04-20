#!/usr/bin/env bun
import { readFileSync, writeFileSync } from "fs";
import { join } from "path";
import OpenAI from "openai";

const OPENAI_API_KEY = process.env.OPENAI_API_KEY!;
const PROMPTS_DIR = join(import.meta.dir, "secx-prompts");
const JSONL_PATH = join(import.meta.dir, "output", "secx-messaging-csv-2026-04-20.jsonl");
const CSV_PATH = "/Users/sjoerdvangalen/Downloads/Untitled spreadsheet - SentioCX-or-Creative-Campaign-Default-view-export-1776689499547 (1).csv";

const TARGET_EMAILS = new Set([
  "ralvarez@bmc.com",
  "spirri@globeandmail.com",
  "roger.maharg@opswat.com",
]);

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

function loadPrompt(persona: Persona): string {
  const path = join(PROMPTS_DIR, `prompt-${persona}.md`);
  return readFileSync(path, "utf-8");
}

async function generateBullets(client: OpenAI, rec: Record): Promise<string[] | null> {
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

    const raw = response.choices[0]?.message?.content;
    if (!raw) return null;

    const parsed = JSON.parse(raw) as { bullets?: string[] };
    if (!Array.isArray(parsed.bullets) || parsed.bullets.length !== 3) {
      console.warn(`[WARN] Malformed output for ${rec.email} — skipping`);
      return null;
    }
    return parsed.bullets;
  } catch (err) {
    console.warn(`[WARN] API error for ${rec.email}: ${(err as Error).message}`);
    return null;
  }
}

async function main() {
  if (!OPENAI_API_KEY) {
    console.error("[ERROR] Missing OPENAI_API_KEY");
    process.exit(1);
  }

  const allRecords = parseCSV(CSV_PATH);
  const targets = allRecords.filter((r) => TARGET_EMAILS.has(r.email));
  console.log(`[INFO] Found ${targets.length} target records to regenerate`);

  const openai = new OpenAI({ apiKey: OPENAI_API_KEY });
  const replacements: Map<string, string[]> = new Map();

  for (const rec of targets) {
    console.log(`\n[REGEN] ${rec.email} | ${rec.company} | ${rec.persona}`);
    const bullets = await generateBullets(openai, rec);
    if (bullets) {
      bullets.forEach((b, i) => console.log(`  B${i + 1}: ${b}`));
      replacements.set(rec.email, bullets);
    } else {
      console.warn(`  [WARN] Failed to regenerate ${rec.email}`);
    }
  }

  // Read JSONL, replace matching records, write back
  const jsonlLines = readFileSync(JSONL_PATH, "utf-8").trim().split("\n");
  const updated: string[] = [];
  let replaced = 0;
  for (const line of jsonlLines) {
    const obj = JSON.parse(line);
    if (replacements.has(obj.email)) {
      obj.bullets = replacements.get(obj.email);
      obj.generated_at = new Date().toISOString();
      replaced++;
    }
    updated.push(JSON.stringify(obj));
  }

  writeFileSync(JSONL_PATH, updated.join("\n") + "\n");
  console.log(`\n[DONE] Replaced ${replaced} records in ${JSONL_PATH}`);
}

main().catch((err) => {
  console.error("[FATAL]", err.message);
  process.exit(1);
});
