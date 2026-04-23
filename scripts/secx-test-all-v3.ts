#!/usr/bin/env bun
import { readFileSync } from "fs";
import { join } from "path";
import OpenAI from "openai";
import { validateBullets, buildRetryFeedback } from "./secx-validator";

const OPENAI_API_KEY = process.env.OPENAI_API_KEY!;
const PROMPTS_DIR = join(import.meta.dir, "secx-prompts");
const CSV_PATH = "/Users/sjoerdvangalen/Downloads/SentioCX-or-Creative-Campaign-Default-view-export-1776689499547.csv";
const CONCURRENCY = 5000;
const RPM_LIMIT = 9500; // 500 below Tier 4 limit of 10,000
const MAX_RETRIES = 3;
const BASE_DELAY_MS = 500;
const WARMUP = true;

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

interface TokenUsage {
  prompt_tokens: number;
  completion_tokens: number;
  cached_tokens: number;
}

interface Result {
  persona: Persona;
  rec: Record;
  bullets: string[] | null;
  usage: TokenUsage | null;
  error?: string;
  validatorScore?: number;
  retryCount?: number;
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

const promptCache = new Map<Persona, string>();
function loadPrompt(persona: Persona): string {
  if (!promptCache.has(persona)) {
    const path = join(PROMPTS_DIR, `prompt-${persona}.md`);
    promptCache.set(persona, readFileSync(path, "utf-8"));
  }
  return promptCache.get(persona)!;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

class RateLimiter {
  private timestamps: number[] = [];
  private readonly windowMs: number;
  private readonly maxRequests: number;

  constructor(maxRequests: number, windowSeconds: number = 60) {
    this.maxRequests = maxRequests;
    this.windowMs = windowSeconds * 1000;
  }

  private cleanOld(): void {
    const now = Date.now();
    this.timestamps = this.timestamps.filter((t) => now - t < this.windowMs);
  }

  /** Non-blocking check: can we start a new request right now? */
  canStart(): boolean {
    this.cleanOld();
    return this.timestamps.length < this.maxRequests;
  }

  /** Record that we started a request. Call this AFTER canStart() returns true. */
  recordStart(): void {
    this.timestamps.push(Date.now());
  }

  /** How many requests started in the current window */
  get currentCount(): number {
    this.cleanOld();
    return this.timestamps.length;
  }

  /** How long to wait (ms) until the oldest request falls out of the window */
  getWaitTime(): number {
    this.cleanOld();
    if (this.timestamps.length < this.maxRequests) return 0;
    const oldest = this.timestamps[0];
    const wait = oldest + this.windowMs - Date.now() + 10;
    return Math.max(0, wait);
  }
}

async function warmupCache(client: OpenAI, persona: Persona): Promise<void> {
  if (!WARMUP) return;
  const systemPrompt = loadPrompt(persona);
  const dummyUser = "Company: Test\nIndustry: SaaS\nEmployees: 201-500";
  try {
    await client.chat.completions.create({
      model: "gpt-5.4-nano",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: dummyUser },
      ],
      temperature: 0.3,
      max_completion_tokens: 10,
      response_format: { type: "json_object" },
    });
  } catch {
    // Ignore warmup errors
  }
}

async function generateBullets(
  client: OpenAI,
  rec: Record,
  feedback?: string
): Promise<{ bullets: string[] | null; usage: TokenUsage | null }> {
  const systemPrompt = loadPrompt(rec.persona);
  const userMessage = buildUserMessage(rec);

  const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
    { role: "system", content: systemPrompt },
    { role: "user", content: userMessage },
  ];

  if (feedback) {
    messages.push({ role: "assistant", content: "Let me fix those issues." });
    messages.push({ role: "user", content: feedback });
  }

  try {
    const response = await client.chat.completions.create({
      model: "gpt-5.4-nano",
      messages,
      temperature: 0.3,
      max_completion_tokens: 200,
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
      return { bullets: null, usage };
    }
    return { bullets: parsed.bullets, usage };
  } catch (err) {
    return { bullets: null, usage: null };
  }
}

async function generateBulletsWithValidation(
  client: OpenAI,
  rec: Record
): Promise<{ bullets: string[] | null; usage: TokenUsage | null; score: number; retryCount: number }> {
  let totalUsage: TokenUsage | null = null;

  // First attempt
  const first = await generateBullets(client, rec);
  totalUsage = first.usage;
  if (!first.bullets) {
    return { bullets: null, usage: totalUsage, score: 0, retryCount: 0 };
  }

  const v1 = validateBullets(first.bullets, rec.persona, rec.company);
  if (v1.passed) {
    return { bullets: first.bullets, usage: totalUsage, score: v1.score, retryCount: 0 };
  }

  // Retry with feedback (max 1 validation retry)
  const feedback = buildRetryFeedback(v1, rec.persona);
  const second = await generateBullets(client, rec, feedback);
  if (second.usage) {
    totalUsage = {
      prompt_tokens: (totalUsage?.prompt_tokens ?? 0) + second.usage.prompt_tokens,
      completion_tokens: (totalUsage?.completion_tokens ?? 0) + second.usage.completion_tokens,
      cached_tokens: (totalUsage?.cached_tokens ?? 0) + second.usage.cached_tokens,
    };
  }

  if (!second.bullets) {
    return { bullets: first.bullets, usage: totalUsage, score: v1.score, retryCount: 1 };
  }

  const v2 = validateBullets(second.bullets, rec.persona, rec.company);
  // Return best attempt
  if (v2.score > v1.score) {
    return { bullets: second.bullets, usage: totalUsage, score: v2.score, retryCount: 1 };
  }
  return { bullets: first.bullets, usage: totalUsage, score: v1.score, retryCount: 1 };
}

async function runBatch(
  client: OpenAI,
  records: Record[],
  onProgress: (done: number, total: number) => void
): Promise<Result[]> {
  const results: Result[] = [];
  const queue = [...records];
  const inFlight = new Set<Promise<void>>();
  const rateLimiter = new RateLimiter(RPM_LIMIT);

  let lastRateLog = 0;
  let startedCount = 0;

  return new Promise((resolve) => {
    function processNext(): void {
      if (queue.length === 0 && inFlight.size === 0) {
        resolve(results);
        return;
      }
      if (queue.length === 0 || inFlight.size >= CONCURRENCY) return;

      // Rate limit check: non-blocking
      if (!rateLimiter.canStart()) {
        const waitMs = rateLimiter.getWaitTime();
        setTimeout(processNext, Math.min(waitMs, 50));
        return;
      }

      const rec = queue.shift()!;
      rateLimiter.recordStart();
      startedCount++;

      const promise = (async () => {
        const { bullets, usage, score, retryCount } = await generateBulletsWithValidation(client, rec);
        results.push({ persona: rec.persona, rec, bullets, usage, validatorScore: score, retryCount });
        onProgress(results.length, records.length);
        inFlight.delete(promise);

        // Log rate limiter status periodically
        const now = Date.now();
        if (now - lastRateLog > 3000) {
          console.log(
            `[RATE] started=${startedCount} rpm=${rateLimiter.currentCount}/${RPM_LIMIT} in-flight=${inFlight.size} queue=${queue.length}`
          );
          lastRateLog = now;
        }

        processNext();
      })();
      inFlight.add(promise);
      processNext();
    }

    processNext();
  });
}

async function main() {
  if (!OPENAI_API_KEY) {
    console.error("[ERROR] Missing OPENAI_API_KEY");
    process.exit(1);
  }

  const records = parseCSV(CSV_PATH);
  console.log(`[INFO] Loaded ${records.length} valid records from CSV`);
  console.log(`[INFO] Concurrency: ${CONCURRENCY} parallel requests (rate limited to ${RPM_LIMIT} RPM)`);

  const openai = new OpenAI({ apiKey: OPENAI_API_KEY });

  const testPersonas: Persona[] = ["ops", "cx", "tech", "csuite"];

  // Build one combined queue with all persona records (no longer sequential per persona)
  const allTestRecords: Record[] = [];
  for (const persona of testPersonas) {
    const personaRecords = records.filter((r) => r.persona === persona).slice(0, 200);
    allTestRecords.push(...personaRecords);
  }
  console.log(`[INFO] Total test batch: ${allTestRecords.length} records across all personas`);

  // Warmup all 4 personas before starting the combined batch
  if (WARMUP) {
    const wStart = Date.now();
    for (const persona of testPersonas) {
      await warmupCache(openai, persona);
    }
    await sleep(200);
    console.log(`[WARMUP] All 4 personas primed in ${Date.now() - wStart}ms`);
  }

  const startTime = Date.now();
  let lastLogged = 0;

  const allResults = await runBatch(openai, allTestRecords, (done, total) => {
    if (done === total || done - lastLogged >= 50) {
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
      console.log(`[PROGRESS] ${done}/${total} done (${elapsed}s)`);
      lastLogged = done;
    }
  });

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`[DONE] All personas completed in ${elapsed}s`);

  // Group results by persona for per-persona summary
  const resultsByPersona: Record<Persona, Result[]> = { ops: [], cx: [], tech: [], csuite: [] };
  for (const r of allResults) {
    resultsByPersona[r.persona].push(r);
  }

  // Per-persona summary
  for (const persona of testPersonas) {
    const results = resultsByPersona[persona];
    if (results.length === 0) continue;

    let totalPrompt = 0;
    let totalCompletion = 0;
    let totalCached = 0;
    let successCount = 0;

    for (const r of results) {
      if (r.usage) {
        totalPrompt += r.usage.prompt_tokens;
        totalCompletion += r.usage.completion_tokens;
        totalCached += r.usage.cached_tokens;
      }
      if (r.bullets) successCount++;
    }

    const uncachedPrompt = totalPrompt - totalCached;
    const costUncached = (uncachedPrompt / 1_000_000) * 0.20;
    const costCached = (totalCached / 1_000_000) * 0.02;
    const costCompletion = (totalCompletion / 1_000_000) * 1.25;
    const totalCost = costUncached + costCached + costCompletion;

    console.log(`\n=== ${persona.toUpperCase()} SUMMARY ===`);
    console.log(`Records tested:         ${results.length}`);
    console.log(`Success rate:           ${successCount}/${results.length}`);
    console.log(`Total prompt tokens:    ${totalPrompt}`);
    console.log(`Total cached tokens:    ${totalCached}`);
    console.log(`Total uncached tokens:  ${uncachedPrompt}`);
    console.log(`Total completion tokens: ${totalCompletion}`);
    console.log(`Cost uncached input:    $${costUncached.toFixed(4)}`);
    console.log(`Cost cached input:      $${costCached.toFixed(4)}`);
    console.log(`Cost output:            $${costCompletion.toFixed(4)}`);
    console.log(`TOTAL COST:             $${totalCost.toFixed(4)}`);
    console.log(`Cost per record:        $${(totalCost / results.length).toFixed(5)}`);
    console.log(`Throughput:             ${(results.length / (parseFloat(elapsed) || 1)).toFixed(1)} records/sec`);
  }

  // Grand total
  console.log(`\n${"=".repeat(60)}`);
  console.log("GRAND TOTAL");
  console.log("=".repeat(60));
  let grandPrompt = 0;
  let grandCompletion = 0;
  let grandCached = 0;
  for (const r of allResults) {
    if (r.usage) {
      grandPrompt += r.usage.prompt_tokens;
      grandCompletion += r.usage.completion_tokens;
      grandCached += r.usage.cached_tokens;
    }
  }
  const grandUncached = grandPrompt - grandCached;
  const grandCostUncached = (grandUncached / 1_000_000) * 0.20;
  const grandCostCached = (grandCached / 1_000_000) * 0.02;
  const grandCostCompletion = (grandCompletion / 1_000_000) * 1.25;
  const grandTotal = grandCostUncached + grandCostCached + grandCostCompletion;
  console.log(`Total records:          ${allResults.length}`);
  console.log(`Total prompt tokens:    ${grandPrompt}`);
  console.log(`Total cached tokens:    ${grandCached}`);
  console.log(`Total uncached tokens:  ${grandUncached}`);
  console.log(`Total completion tokens: ${grandCompletion}`);
  console.log(`Cost uncached input:    $${grandCostUncached.toFixed(4)}`);
  console.log(`Cost cached input:      $${grandCostCached.toFixed(4)}`);
  console.log(`Cost output:            $${grandCostCompletion.toFixed(4)}`);
  console.log(`TOTAL COST:             $${grandTotal.toFixed(4)}`);
  console.log(`Cost per record:        $${(grandTotal / allResults.length).toFixed(5)}`);

  // Save results
  const dateStr = new Date().toISOString().split("T")[0];
  const outPath = join(import.meta.dir, "output", `secx-test-all-v3-${dateStr}.json`);
  const csvPath = join(import.meta.dir, "output", `secx-test-all-v3-${dateStr}.csv`);
  const fs = await import("fs");
  fs.mkdirSync(join(import.meta.dir, "output"), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(allResults, null, 2));

  function csvEscape(val: string): string {
    if (val.includes(",") || val.includes('"') || val.includes("\n")) {
      return `"${val.replace(/"/g, '""')}"`;
    }
    return val;
  }
  const csvLines: string[] = [];
  csvLines.push("company,persona,industry,employees,email,title,bullets");
  for (const { rec, bullets } of allResults) {
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
