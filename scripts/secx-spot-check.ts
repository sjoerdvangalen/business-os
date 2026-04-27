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
  const openai = new OpenAI({ apiKey: OPENAI_API_KEY });

  // Spot-check specific records that had issues
  const targets = [
    { company: "Lamb Weston", persona: "cx" as Persona },
    { company: "COFOMO", persona: "cx" as Persona },
    { company: "Checkout.com", persona: "cx" as Persona },
    { company: "Cash App", persona: "cx" as Persona },
    { company: "Blue Cross Blue Shield of Arizona", persona: "cx" as Persona },
    { company: "Colibri Group", persona: "cx" as Persona },
    { company: "Foundation Source", persona: "tech" as Persona },
    { company: "GM Financial", persona: "tech" as Persona },
    { company: "Komodo Health", persona: "tech" as Persona },
  ];

  for (const target of targets) {
    const rec = allRecords.find((r) => r.company === target.company && r.persona === target.persona);
    if (!rec) {
      console.log(`\n[MISSING] ${target.company} (${target.persona}) — not found in CSV`);
      continue;
    }

    console.log(`\n${"=".repeat(60)}`);
    console.log(`[TEST] ${rec.company} | ${rec.persona} | ${rec.title}`);
    console.log(`[INPUT] ${rec.employees} | ${rec.industry}`);
    console.log(`[SUMMARY] ${rec.summary.slice(0, 120)}...`);

    const bullets = await generateBullets(openai, rec);
    if (bullets) {
      bullets.forEach((b, i) => {
        const wordCount = b.replace(/\.$/, "").split(/\s+/).length;
        console.log(`  B${i + 1} (${wordCount}w): ${b}`);
      });
    } else {
      console.log(`  [ERROR] Failed to generate bullets`);
    }
  }
}

main().catch((err) => {
  console.error("[FATAL]", err.message);
  process.exit(1);
});
