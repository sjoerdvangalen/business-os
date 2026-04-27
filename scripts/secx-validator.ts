#!/usr/bin/env bun
/**
 * Bullet validator for SentioCX prompts.
 * Scores each bullet 0-100. Returns score + detailed feedback.
 * Score < 80 = needs retry with feedback.
 */

export interface ValidationResult {
  score: number;
  passed: boolean;
  errors: string[];
  warnings: string[];
}

const VAGUE_PATTERNS = [
  "hundreds of thousands of", "tens of thousands of",
  "thousands of", "millions of", "hundreds of", "dozens of"
];

const FORBIDDEN_ID_PATTERNS = [/NMLS ID \d+/, /ISO \d+/, /FDA/];

const MARKETING_WORDS = ["trusted", "innovative", "world-class", "best-in-class", "leading provider", "million employees", "millions of employees"];

const FORBIDDEN_PHRASES: Record<string, string[]> = {
  ops: ["millions of customers", "millions of consumers", "millions of developers", "millions of people", "millions of users"],
  cx: [],
  tech: [],
  csuite: ["and 200 items", "and 4,000+ people", "and 1,000+ people", "and 5,000+ people", "and 10,000+ people", "and almost", "employees without"],
};

export function validateBullets(
  bullets: string[],
  persona: "ops" | "cx" | "tech" | "csuite",
  companyName: string
): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // --- STRUCTURAL CHECKS ---
  if (bullets.length !== 3) {
    errors.push(`Expected 3 bullets, got ${bullets.length}`);
    return { score: 0, passed: false, errors, warnings };
  }

  const b1 = bullets[0].trim();
  const b2 = bullets[1].trim();
  const b3 = bullets[2].trim();

  // Word count per bullet
  for (let i = 0; i < 3; i++) {
    const words = bullets[i].split(/\s+/).filter(w => w.length > 0).length;
    if (words < 10) errors.push(`B${i+1} too short: ${words} words (min 10)`);
    if (words > 20) errors.push(`B${i+1} too long: ${words} words (max 20)`);
  }

  // Company name check
  if (b1.includes(companyName) || b2.includes(companyName) || b3.includes(companyName)) {
    errors.push("Company name appears in bullet");
  }

  // Marketing language check (all personas)
  for (const mw of MARKETING_WORDS) {
    if (b1.toLowerCase().includes(mw)) errors.push(`B1 contains marketing language: "${mw}"`);
    if (b2.toLowerCase().includes(mw)) errors.push(`B2 contains marketing language: "${mw}"`);
    if (b3.toLowerCase().includes(mw)) errors.push(`B3 contains marketing language: "${mw}"`);
  }

  // --- PERSONA-SPECIFIC CHECKS ---

  if (persona === "ops") {
    // B1 must start with "Apply" or "Use"
    if (!b1.startsWith("Apply ") && !b1.startsWith("Use ")) {
      errors.push("B1 must start with 'Apply' or 'Use'");
    }

    // B1 must contain "automated routing"
    if (!b1.includes("automated routing")) errors.push("B1 missing 'automated routing'");

    // B1 must contain "dedicated"
    if (!b1.includes("dedicated ")) errors.push("B1 missing 'dedicated'");

    // B2 must start with "Route"
    if (!b2.startsWith("Route ")) errors.push("B2 must start with 'Route'");

    // B2 must have exactly ONE "and"
    const b2Ands = (b2.match(/\band\b/g) || []).length;
    if (b2Ands !== 1) errors.push(`B2 has ${b2Ands} 'and' (need exactly 1)`);

    // B2 must NOT have "or"
    if (b2.includes(" or ")) errors.push("B2 contains 'or'");

    // B3 must contain mandatory extension clause
    if (!b3.includes("while maintaining ")) {
      errors.push("B3 missing extension clause 'while maintaining ...'");
    }

    // B3 constraint check
    const hasConstraint = /without (overtime|adding coordinators|expanding the team)/.test(b3);
    if (!hasConstraint) errors.push("B3 missing valid constraint");

    // B1 vague quantity check
    for (const vp of VAGUE_PATTERNS) {
      if (b1.toLowerCase().includes(vp)) {
        errors.push(`B1 contains vague quantity: "${vp}"`);
      }
    }

    // B1 ID check
    for (const idPat of FORBIDDEN_ID_PATTERNS) {
      if (idPat.test(b1)) errors.push(`B1 contains forbidden ID pattern: ${idPat.source}`);
    }

    // Forbidden phrases
    for (const fp of (FORBIDDEN_PHRASES.ops || [])) {
      if (b1.includes(fp)) errors.push(`B1 contains forbidden phrase: "${fp}"`);
    }

    // Employee count in B1 (including disguised forms)
    if (/\d+\+? employees/.test(b1)) errors.push("B1 contains raw employee count");
    if (/\d+\+? people/.test(b1)) errors.push("B1 contains 'people' (employee count)");
    if (/\d+\+? workforce/.test(b1)) errors.push("B1 contains 'workforce' with number (employee count disguised)");
    // Only catch employee count ranges disguised as other metrics (200, 500, 1000, 5000)
    if (/\b(200|500|1,000|1000|5,000|5000)\+?\s+(developers|users|markets|accounts|candidates)\b/.test(b1)) errors.push("B1 contains employee count disguised as another metric");
    // Compound disguise: number + workforce + scope word (e.g., "200+ workforce markets")
    if (/\d+\+? workforce \w+/.test(b1)) errors.push("B1 contains compound employee count disguise (workforce + scope word)");
  }

  if (persona === "cx") {
    // B1 must start with "Route"
    if (!b1.startsWith("Route ")) errors.push("B1 must start with 'Route'");

    // B1 must contain "without any"
    if (!b1.includes("without any ")) errors.push("B1 missing 'without any [friction]'");

    // B2 must start with "Apply"
    if (!b2.startsWith("Apply ")) errors.push("B2 must start with 'Apply'");

    // B2 exactly one "and"
    const b2Ands = (b2.match(/\band\b/g) || []).length;
    if (b2Ands !== 1) errors.push(`B2 has ${b2Ands} 'and' (need exactly 1)`);

    // B3 order check: "by leveraging" must come AFTER "without"
    const withoutIdx = b3.indexOf("without ");
    const leveragingIdx = b3.indexOf("by leveraging ");
    if (leveragingIdx === -1) {
      errors.push("B3 missing 'by leveraging [mechanism]'");
    } else if (withoutIdx > leveragingIdx) {
      errors.push("B3 wrong order: 'by leveraging' must come AFTER 'without'");
    }

    // B3 constraint
    if (!b3.includes("without adding headcount") && !b3.includes("without expanding your team")) {
      errors.push("B3 missing valid constraint");
    }
  }

  if (persona === "tech") {
    // B1 must start with "Use" and contain "API-first intent routing"
    if (!b1.startsWith("Use ")) errors.push("B1 must start with 'Use'");
    if (!b1.includes("API-first intent routing")) {
      errors.push("B1 missing 'API-first intent routing'");
    }

    // B1 must NOT have data point (employee count or vague)
    if (/\d+\+? employees/.test(b1)) errors.push("B1 contains employee count");
    for (const vp of VAGUE_PATTERNS) {
      if (b1.toLowerCase().includes(vp)) errors.push(`B1 contains vague quantity: "${vp}"`);
    }

    // B2 must start with "Apply"
    if (!b2.startsWith("Apply ")) errors.push("B2 must start with 'Apply'");

    // B2: exactly ONE "and" (between "intent" and "urgency"), no "or"
    const b2Ands = (b2.match(/\band\b/g) || []).length;
    if (b2Ands !== 1) errors.push(`B2 has ${b2Ands} 'and' (need exactly 1, between 'intent' and 'urgency')`);
    if (b2.includes(" or ")) errors.push("B2 contains 'or'");

    // B3 must start with "Deploy"
    if (!b3.startsWith("Deploy ")) errors.push("B3 must start with 'Deploy'");

    // B3: no "and" or "or"
    if (b3.includes(" and ") || b3.includes(" or ")) {
      errors.push("B3 contains 'and' or 'or' (must have exactly one outcome)");
    }
  }

  if (persona === "csuite") {
    // B1 must start with "Cut"
    if (!b1.startsWith("Cut ")) errors.push("B1 must start with 'Cut'");

    // B2 must start with "Scale"
    if (!b2.startsWith("Scale ")) errors.push("B2 must start with 'Scale'");

    // B3 must start with "Deliver"
    if (!b3.startsWith("Deliver ")) errors.push("B3 must start with 'Deliver'");

    // B1 must follow: "...workforce [data_point] without [degradation]"
    const workforceIdx = b1.indexOf("workforce");
    const withoutIdx = b1.indexOf("without ");
    if (workforceIdx === -1) errors.push("B1 missing 'workforce'");
    if (withoutIdx === -1) errors.push("B1 missing 'without [degradation]'");
    if (workforceIdx > withoutIdx) errors.push("B1 wrong order: 'workforce' must come BEFORE 'without'");

    // B2 must NOT have data point or combined scopes
    if (/\band \d+/.test(b2) || /serving \d+/.test(b2)) {
      warnings.push("B2 may contain unexpected data point");
    }
    if (b2.includes(" / ")) {
      errors.push("B2 combines two scopes with '/' — pick exactly ONE scope");
    }

    // B1 forbidden phrases
    for (const fp of (FORBIDDEN_PHRASES.csuite || [])) {
      if (b1.includes(fp)) errors.push(`B1 contains forbidden phrase: "${fp}"`);
    }

    // B1 fraction check
    if (/\d+\/\d+/.test(b1)) errors.push("B1 contains fraction");

    // B1 employee count
    if (/\d+\+? employees/.test(b1)) errors.push("B1 contains employee count");

    // Vague quantities
    for (const vp of VAGUE_PATTERNS) {
      if (b1.toLowerCase().includes(vp)) errors.push(`B1 contains vague quantity: "${vp}"`);
    }
  }

  // --- SCORING ---
  let score = 100;
  score -= errors.length * 15;
  score -= warnings.length * 5;
  score = Math.max(0, score);

  return {
    score,
    passed: score >= 80 && errors.length === 0,
    errors,
    warnings,
  };
}

export function buildRetryFeedback(
  result: ValidationResult,
  persona: string,
  bullets?: string[]
): string {
  const lines: string[] = [
    `Previous attempt scored ${result.score}/100. Issues found:`,
    ...result.errors.map((e) => `- ${e}`),
  ];
  if (result.warnings.length > 0) {
    lines.push("Warnings:");
    lines.push(...result.warnings.map((w) => `- ${w}`));
  }
  if (bullets && bullets.length === 3) {
    lines.push("");
    lines.push("Previous bullets (for reference — DO NOT reuse verbatim):");
    lines.push(`B1: ${bullets[0]}`);
    lines.push(`B2: ${bullets[1]}`);
    lines.push(`B3: ${bullets[2]}`);
  }
  lines.push("");
  lines.push("INSTRUCTIONS FOR FIX:");
  for (const err of result.errors) {
    if (err.includes("vague quantity")) {
      lines.push("- REMOVE the vague quantity phrase entirely. Use the bare baseline without any data_point in B1.");
    } else if (err.includes("employee count") || err.includes("workforce")) {
      lines.push("- REMOVE the employee count from B1. Employee count goes ONLY in B3 after '...workforce'. Use bare baseline for B1.");
    } else if (err.includes("missing 'automated routing'")) {
      lines.push("- ADD 'automated routing' to B1.");
    } else if (err.includes("dedicated")) {
      lines.push("- ADD 'dedicated' before the specialist role in B1.");
    } else if (err.includes("too short")) {
      lines.push("- ADD missing mandatory phrases to reach minimum word count.");
    } else if (err.includes("too long")) {
      lines.push("- REMOVE the data_point from the bullet that is too long.");
    }
  }
  lines.push("Fix ALL issues and regenerate the bullets.");
  return lines.join("\n");
}
