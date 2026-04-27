#!/usr/bin/env bun
import { readFileSync } from "fs";
import { join } from "path";
import OpenAI from "openai";

const OPENAI_API_KEY = process.env.OPENAI_API_KEY!;
const PROMPTS_DIR = join(import.meta.dir, "secx-prompts");

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

const TEST_RECORDS: Record[] = [
  {
    first_name: "Scott", last_name: "Holden", email: "scott.holden@flagstar.com",
    title: "Assistant Vice President - Branch Leader", company: "Flagstar Bank",
    industry: "Financial", employees: "5001-10,000 employees", persona: "ops",
    website: "https://www.flagstar.com",
    summary: "Thank you for visiting Flagstar Bank, N.A. on LinkedIn, and we look forward to being part of your financial journey. Today, Flagstar Bank, N.A., is one of the largest regional banks in the country. The company is headquartered in Hicksville, New York. At December 31, 2025, the company had assets of $87.5 billion. We operate approximately 340 locations across nine states, with strong footholds in the greater New York/New Jersey metropolitan region and in the upper Midwest, along with a significant presence in fast-growing markets in Florida and the West Coast."
  },
  {
    first_name: "Bill", last_name: "Brower", email: "william.brower@solera.com",
    title: "Senior Vice President", company: "Solera Holdings, LLC.",
    industry: "SaaS", employees: "5001-10,000 employees", persona: "ops",
    website: "https://www.solera.com",
    summary: "Solera is the global leader in vehicle lifecycle management software-as-a-service, data, and services. Through four lines of business – vehicle claims, vehicle repairs, vehicle solutions, and fleet solutions – Solera is home to many leading brands in the vehicle lifecycle ecosystem, including Identifix, Audatex, DealerSocket, Omnitracs, LoJack, Spireon, eDriving/Mentor, Explore, cap hpi, Autodata, and others. Solera empowers its customers to succeed in the digital age by providing them with a one-stop-shop solution that streamlines operations, offers data-driven analytics, and enhances customer engagement, which Solera believes helps customers drive sales, promote customer retention, and improve profit margins. Solera serves over 280,000 global customers and partners in 120+ countries."
  },
  {
    first_name: "Matt", last_name: "Love", email: "mlove@natera.com",
    title: "Vice President", company: "Natera",
    industry: "Healthcare", employees: "5001-10,000 employees", persona: "ops",
    website: "https://www.natera.com",
    summary: "Natera is a global leader in cell-free DNA and precision medicine, dedicated to oncology, women's health, and organ health. We aim to make personalized genetic testing and diagnostics part of the standard-of-care to protect health and inform earlier, more targeted interventions that help lead to longer, healthier lives. Natera's tests are supported by more than 325 peer-reviewed publications that demonstrate excellent performance. Natera operates ISO 13485-certified and CAP-accredited laboratories certified under the Clinical Laboratory Improvement Amendments (CLIA) in Austin, Texas, and San Carlos, California, and through Foresight Diagnostics, its subsidiary, operates an ISO 27001-certified and CAP-accredited laboratory certified under CLIA in Boulder, Colorado."
  },
  {
    first_name: "David", last_name: "Jones", email: "david.jones@hays.com",
    title: "Vice President", company: "Hays",
    industry: "Staffing", employees: "5001-10,000 employees", persona: "ops",
    website: "https://www.haysplc.com",
    summary: "We are leaders in specialist recruitment and workforce solutions, offering advisory services such as learning and skill development, career transitions and employer brand positioning."
  },
  {
    first_name: "Erwin", last_name: "Raphael", email: "erwin@lucidmotors.com",
    title: "Senior Vice President, Global Revenue", company: "Lucid Motors",
    industry: "Manufacturing", employees: "1001-5000 employees", persona: "ops",
    website: "https://www.lucidmotors.com",
    summary: "We launched Lucid in 2016 to build the world's best cars and accelerate the shift to clean energy. Our vehicles deliver best-in-class performance and efficiency. Equally important, we're building a world-class team: From our state-of-the-art factory in Arizona to our global headquarters in California's Silicon Valley, we're recruiting high-performing people who want to help decarbonize Earth."
  }
];

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
      return { bullets: null, usage };
    }
    return { bullets: parsed.bullets, usage };
  } catch (err) {
    return { bullets: null, usage: null };
  }
}

async function main() {
  if (!OPENAI_API_KEY) {
    console.error("[ERROR] Missing OPENAI_API_KEY");
    process.exit(1);
  }

  const openai = new OpenAI({ apiKey: OPENAI_API_KEY });

  for (const rec of TEST_RECORDS) {
    console.log(`\n[TEST] ${rec.company} | ${rec.industry} | ${rec.employees}`);
    console.log(`[DATA POINTS IN SUMMARY] ${rec.summary.match(/\$?[\d,]+[\w+]*|[\d,]+\+? (customers|countries|states|locations|publications|laboratories)/gi)?.join(", ") || "none detected"}`);
    const { bullets, usage } = await generateBullets(openai, rec);
    if (bullets) {
      bullets.forEach((b, i) => console.log(`  B${i + 1}: ${b}`));
    }
    if (usage) {
      console.log(`  [TOKENS] prompt=${usage.prompt_tokens} completion=${usage.completion_tokens}`);
    }
  }
}

main().catch((err) => {
  console.error("[FATAL]", err.message);
  process.exit(1);
});
