/**
 * Hook virality scorer.
 *
 * Given a guide's hook + script + caption + title, evaluates whether the
 * opener is strong enough to stop a scroll and suggests 3 rewritten
 * alternatives the admin can swap in.
 *
 * Returns a structured JSON object so the UI can render scores +
 * rewrites with copy-to-clipboard buttons per suggestion.
 */

import Anthropic from "@anthropic-ai/sdk";

export type RateHookInput = {
  title: string;
  hook: string;
  script: string;
  caption: string;
};

export type HookRating = {
  /** Overall 1-10 virality score. */
  overallScore: number;
  /** One-sentence verdict the admin reads first. */
  verdict: string;
  /** Per-dimension scores. */
  scores: {
    curiosityGap: number;     // Does it create a "I have to know more" pull?
    specificity: number;       // Concrete vs vague?
    patternInterrupt: number;  // Surprising vs expected?
    clarity: number;           // Is it easy to understand in 2 seconds?
    relevance: number;         // Does it match what the script actually delivers?
  };
  /** What's working in the current hook. */
  strengths: string[];
  /** What's weak — actionable critique, not vague vibes. */
  weaknesses: string[];
  /** 3 fully-written alternative hooks the admin can paste in directly. */
  rewrites: string[];
};

const MODEL = process.env.RATE_HOOK_MODEL ?? "claude-sonnet-4-5";

const SYSTEM_PROMPT = `You are a viral-content strategist who has analyzed millions of Reels and TikToks.
Your job: rate the HOOK of a piece of content for scroll-stopping power on a 1-10
scale, then write 3 better alternatives the creator can swap in directly.

You will receive a guide's title, hook, talking-head script, and caption. Your
output is a single JSON object — no markdown, no preamble, no code fences.

Scoring rubric (each dimension 1-10):
- curiosityGap: Does the hook create a "I have to know more" pull? 10 = unmissable.
- specificity: Is it concrete and specific (vs vague platitudes)? 10 = razor-sharp.
- patternInterrupt: Does it break expectations? 10 = stops the scroll cold.
- clarity: Is it understandable in <2 seconds? 10 = instantly clear.
- relevance: Does the hook accurately preview what the script delivers? 10 = perfectly aligned (clickbait that lies scores low here).

overallScore: a holistic 1-10 that may differ from the average — weight curiosity
and pattern-interrupt heavier than clarity for top-of-funnel reach content.

Verdict: one sentence (≤25 words) that the creator reads first.
Strengths: 1-3 bullet items, each ≤15 words, naming what's working.
Weaknesses: 1-4 bullet items, each ≤20 words, naming specific issues (not vibes).
Rewrites: exactly 3 fully-written hook alternatives the creator can paste in.
Each rewrite ≤ 25 words. Use different angles (e.g. one curiosity-gap, one
contrarian, one specific-number). Pull from the script's content — do not
invent new claims.

Output JSON schema (return ONLY this object):

{
  "overallScore": <number 1-10>,
  "verdict": "<one sentence>",
  "scores": {
    "curiosityGap": <1-10>,
    "specificity": <1-10>,
    "patternInterrupt": <1-10>,
    "clarity": <1-10>,
    "relevance": <1-10>
  },
  "strengths": ["...", "..."],
  "weaknesses": ["...", "..."],
  "rewrites": ["...", "...", "..."]
}`;

function buildUserPrompt(input: RateHookInput): string {
  return [
    `TITLE: ${input.title}`,
    "",
    `CURRENT HOOK:`,
    input.hook,
    "",
    `TALKING-HEAD SCRIPT (what the hook needs to accurately preview):`,
    input.script,
    "",
    `CAPTION (additional context):`,
    input.caption,
    "",
    `Score the hook and write 3 alternatives. Return JSON only.`,
  ].join("\n");
}

function parseRating(raw: string): HookRating {
  // Strip code fences if the model added them despite the instruction.
  const cleaned = raw
    .trim()
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/```\s*$/i, "")
    .trim();
  const parsed = JSON.parse(cleaned) as HookRating;
  if (typeof parsed.overallScore !== "number") {
    throw new Error("Response missing overallScore");
  }
  if (!Array.isArray(parsed.rewrites) || parsed.rewrites.length === 0) {
    throw new Error("Response missing rewrites");
  }
  return parsed;
}

export async function rateHookForVirality(input: RateHookInput): Promise<HookRating> {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key || !key.startsWith("sk-ant")) {
    throw new Error("ANTHROPIC_API_KEY missing or malformed (server env).");
  }
  const client = new Anthropic({ apiKey: key });
  const msg = await client.messages.create({
    model: MODEL,
    max_tokens: 1500,
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: buildUserPrompt(input) }],
  });
  const first = msg.content[0];
  if (!first || first.type !== "text") {
    throw new Error("Anthropic returned no text content");
  }
  return parseRating(first.text);
}
