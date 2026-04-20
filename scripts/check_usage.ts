#!/usr/bin/env bun
import { readFileSync } from "fs";
import { join } from "path";
import OpenAI from "openai";

const OPENAI_API_KEY = process.env.OPENAI_API_KEY!;
const PROMPTS_DIR = join(import.meta.dir, "secx-prompts");
const CSV_PATH = "/Users/sjoerdvangalen/Downloads/Untitled spreadsheet - SentioCX-or-Creative-Campaign-Default-view-export-1776689499547 (1).csv";

function loadPrompt(persona: string) {
  return readFileSync(join(PROMPTS_DIR, `prompt-${persona}.md`), "utf-8");
}

function parseFirstRecord(path: string) {
  const raw = readFileSync(path, "utf-8").trim();
  const lines = raw.split("\n");
  const headers = lines[0].split(",").map((h) => h.trim().replace(/^"|"$/g, ""));
  const line = lines[1];
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
  const persona = cols[11].toLowerCase().includes("cx") ? "cx" : cols[11].toLowerCase().includes("ops") ? "ops" : cols[11].toLowerCase().includes("tech") ? "tech" : "csuite";
  return {
    company: cols[4],
    industry: cols[10],
    employees: cols[8],
    persona,
    website: cols[12],
    title: cols[3],
    summary: cols[13],
  };
}

async function main() {
  const rec = parseFirstRecord(CSV_PATH);
  const system = loadPrompt(rec.persona);
  const user = `Company: ${rec.company}\nIndustry: ${rec.industry}\nEmployees: ${rec.employees}\nWebsite: ${rec.website}\nContact title: ${rec.title}\nCompany summary: ${rec.summary}`;
  const client = new OpenAI({ apiKey: OPENAI_API_KEY });
  const resp = await client.chat.completions.create({
    model: "gpt-5.4-nano",
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
    temperature: 0.3,
    max_completion_tokens: 400,
    response_format: { type: "json_object" },
  });
  console.log("Usage:", JSON.stringify(resp.usage, null, 2));
  console.log("Bullets:", resp.choices[0]?.message?.content);
}

main().catch(console.error);
