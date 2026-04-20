#!/usr/bin/env bun
import { readFileSync } from "fs";
import { join } from "path";
import OpenAI from "openai";

const OPENAI_API_KEY = process.env.OPENAI_API_KEY!;
const PROMPTS_DIR = join(import.meta.dir, "secx-prompts");

function loadPrompt(persona: string) {
  return readFileSync(join(PROMPTS_DIR, `prompt-${persona}.md`), "utf-8");
}

const personas = ["cx", "csuite", "tech", "ops"] as const;

async function main() {
  const client = new OpenAI({ apiKey: OPENAI_API_KEY });
  
  for (const persona of personas) {
    const system = loadPrompt(persona);
    const user = `Company: TestCorp\nIndustry: SaaS\nEmployees: 1001-5000\nWebsite: https://testcorp.com\nContact title: VP Engineering\nCompany summary: TestCorp is a leading SaaS platform with 50,000 users worldwide.`;
    
    console.log(`\n=== ${persona.toUpperCase()} | Prompt: ${system.length} chars ===`);
    
    // Call 1
    const resp1 = await client.chat.completions.create({
      model: "gpt-5.4-nano",
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      temperature: 0.3,
      max_completion_tokens: 400,
      response_format: { type: "json_object" },
    });
    const u1 = resp1.usage;
    console.log(`Call 1: prompt=${u1?.prompt_tokens} completion=${u1?.completion_tokens} cached=${u1?.prompt_tokens_details?.cached_tokens ?? 0}`);
    
    // Call 2 - same prompt
    const resp2 = await client.chat.completions.create({
      model: "gpt-5.4-nano",
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      temperature: 0.3,
      max_completion_tokens: 400,
      response_format: { type: "json_object" },
    });
    const u2 = resp2.usage;
    console.log(`Call 2: prompt=${u2?.prompt_tokens} completion=${u2?.completion_tokens} cached=${u2?.prompt_tokens_details?.cached_tokens ?? 0}`);
    
    // Call 3 - same prompt again
    const resp3 = await client.chat.completions.create({
      model: "gpt-5.4-nano",
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      temperature: 0.3,
      max_completion_tokens: 400,
      response_format: { type: "json_object" },
    });
    const u3 = resp3.usage;
    console.log(`Call 3: prompt=${u3?.prompt_tokens} completion=${u3?.completion_tokens} cached=${u3?.prompt_tokens_details?.cached_tokens ?? 0}`);
  }
}

main().catch(console.error);
