/**
 * Script + Caption quality scorer.
 *
 * Evaluates the talking-head script and Instagram caption as a pair,
 * scoring them on dimensions that matter for short-form social video
 * (Reels / TikTok / Shorts). Returns structured JSON so the UI can
 * render score badges + improvement suggestions.
 *
 * Uses the same Anthropic SDK pattern as rate-hook.ts.
 */

import Anthropic from "@anthropic-ai/sdk";

export type RateContentInput = {
  title: string;
  hook: string;
  script: string;
  caption: string;
  hashtags: string[];
};

export type ContentRating = {
  /** Overall 1-10 quality score for the script. */
  scriptScore: number;
  /** Overall 1-10 quality score for the caption. */
  captionScore: number;
  /** One-sentence verdict the admin reads first. */
  verdict: string;

  /** Per-dimension scores for the script. */
  scriptScores: {
    structure: number;       // Clear open-body-close arc?
    engagement: number;      // Keeps the viewer watching to the end?
    pacing: number;          // Right length, no dead spots?
    valueDelivery: number;   // Does it teach/reveal something concrete?
    speakability: number;    // Natural when read aloud on camera?
  };

  /** Per-dimension scores for the caption. */
  captionScores: {
    hookAlignment: number;   // Does the caption match the video's hook?
    callToAction: number;    // Clear CTA (save, share, comment, keyword)?
    readability: number;     // Scannable, no walls of text?
    seoValue: number;        // Keywords, discoverability?
    lengthFit: number;       // Right length for the platform (not too long/short)?
  };

  /** What's working. */
  strengths: string[];
  /** Actionable improvements. */
  improvements: string[];
  /** 2 rewritten captions the admin can swap in. */
  captionRewrites: string[];
};

const MODEL = process.env.RATE_HOOK_MODEL ?? "claude-sonnet-4-5";

const SYSTEM_PROMPT = `You are a social-media content coach who has analyzed tens of thousands of viral Reels, TikToks, and Shorts.

Your job: rate a talking-head SCRIPT and its INSTAGRAM CAPTION as a pair, scoring each on 5 dimensions (1-10), then suggest 2 better caption alternatives.

You will receive the guide's title, hook, script, caption, and hashtags. Your output is a single JSON object — no markdown, no preamble, no code fences.

SCRIPT scoring rubric (each 1-10):
- structure: Does it have a clear open-body-close arc? 10 = perfect storytelling structure.
- engagement: Does it hold attention from start to finish? 10 = impossible to scroll past.
- pacing: Is the length right, no filler or dead spots? 10 = every sentence earns its place.
- valueDelivery: Does it teach or reveal something concrete? 10 = viewer learns a real skill/insight.
- speakability: Does it sound natural read aloud on camera? 10 = conversational, no awkward phrasing.

CAPTION scoring rubric (each 1-10):
- hookAlignment: Does the caption match / complement the video's hook and content? 10 = perfectly aligned.
- callToAction: Is there a clear CTA (save, share, comment, keyword trigger)? 10 = unmissable CTA.
- readability: Is it scannable? Uses line breaks, not walls of text? 10 = instantly scannable.
- seoValue: Good keywords for discoverability? 10 = algorithm-friendly.
- lengthFit: Right length for Instagram/TikTok (100-200 words ideal)? 10 = perfect length.

scriptScore: holistic 1-10 for the script overall.
captionScore: holistic 1-10 for the caption overall.
verdict: one sentence (max 25 words) summarizing both.
strengths: 2-4 bullets (max 15 words each) — what's working.
improvements: 2-4 bullets (max 20 words each) — specific fixes, not vague vibes.
captionRewrites: exactly 2 fully-written alternative captions. Each should be 80-150 words. Include a CTA. Do NOT invent claims — only use info from the script.

Output JSON schema (return ONLY this):

{
  "scriptScore": <1-10>,
  "captionScore": <1-10>,
  "verdict": "<one sentence>",
  "scriptScores": {
    "structure": <1-10>,
    "engagement": <1-10>,
    "pacing": <1-10>,
    "valueDelivery": <1-10>,
    "speakability": <1-10>
  },
  "captionScores": {
    "hookAlignment": <1-10>,
    "callToAction": <1-10>,
    "readability": <1-10>,
    "seoValue": <1-10>,
    "lengthFit": <1-10>
  },
  "strengths": ["...", "..."],
  "improvements": ["...", "..."],
  "captionRewrites": ["...", "..."]
}`;

function buildUserPrompt(input: RateContentInput): string {
  return [
    `TITLE: ${input.title}`,
    "",
    `HOOK (first line on camera):`,
    input.hook,
    "",
    `TALKING-HEAD SCRIPT:`,
    input.script,
    "",
    `INSTAGRAM CAPTION:`,
    input.caption,
    "",
    `HASHTAGS: ${input.hashtags.join(" ") || "(none)"}`,
    "",
    `Score both the script and caption. Return JSON only.`,
  ].join("\n");
}

function parseRating(raw: string): ContentRating {
  const cleaned = raw
    .trim()
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/```\s*$/i, "")
    .trim();
  const parsed = JSON.parse(cleaned) as ContentRating;
  if (typeof parsed.scriptScore !== "number") {
    throw new Error("Response missing scriptScore");
  }
  if (typeof parsed.captionScore !== "number") {
    throw new Error("Response missing captionScore");
  }
  return parsed;
}

export async function rateContentQuality(
  input: RateContentInput,
): Promise<ContentRating> {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key || !key.startsWith("sk-ant")) {
    throw new Error("ANTHROPIC_API_KEY missing or malformed (server env).");
  }
  const client = new Anthropic({ apiKey: key });
  const msg = await client.messages.create({
    model: MODEL,
    max_tokens: 2000,
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: buildUserPrompt(input) }],
  });
  const first = msg.content[0];
  if (!first || first.type !== "text") {
    throw new Error("Anthropic returned no text content");
  }
  return parseRating(first.text);
}
