import Anthropic from "@anthropic-ai/sdk";
import { anthropic, MODELS, assertAnthropicConfigured } from "./claude";
import type { PostScore } from "@/lib/post-rating";

/**
 * Stable, user-safe error thrown by fixPost(). The original cause (raw Claude
 * output, JSON parse error, SDK exception) is logged server-side via
 * console.error and never surfaced to the UI — so a malformed model response
 * can't leak through a server-action error message.
 */
export class PostFixerError extends Error {
  constructor(message: string, public readonly cause?: unknown) {
    super(message);
    this.name = "PostFixerError";
  }
}

/**
 * AI-powered post rewriter — "viralize" mode.
 *
 * Generates THREE viral-tuned variants for an under-performing post.
 * Variants are anchored in actual viral signals from the user's data:
 *  - Their top-performing hooks (voice DNA)
 *  - Viral competitor hooks in their niche (proven scroll-stoppers)
 *  - Concept pairs that compound for them (audience signal)
 *
 * Each variant is a standalone rewrite — different hook pattern + angle.
 * The caller scores each via hook-suggester's kNN over the Hook DB so the
 * UI can rank them by predicted engagement.
 */

export type FixVariant = {
  hook: string;        // 8-14 word hook
  caption: string;     // full caption with hook prepended
  hashtags: string[];  // 5-10 lowercase tags
  cta: string;         // one-line CTA
  pattern: string;     // question | stat | story | controversy | promise | callout | curiosity_gap | numbered | command
  rationale: string;   // why this variant should perform better
};

export type ViralSignals = {
  myTopHooks: { text: string; avgER: number | null }[];   // up to 5
  nicheViralHooks: { text: string; views: number }[];     // up to 5
  conceptPairs: { a: string; b: string; lift: number }[]; // up to 3
};

const SYSTEM = `You rewrite under-performing social media posts into THREE distinct viral-tuned variants.

Output strict JSON ONLY (no prose, no markdown fences):
{
  "variants": [
    {
      "hook": "...",
      "caption": "...",
      "hashtags": ["..."],
      "cta": "...",
      "pattern": "question|stat|story|controversy|promise|callout|curiosity_gap|numbered|command",
      "rationale": "..."
    },
    { ...second variant... },
    { ...third variant... }
  ]
}

Rules per variant:
- Hook: 8-14 words. Specific. Curiosity-driving. NO emojis. NO clichés ("Here's the thing", "Did you know", "Let me tell you").
- Caption: 100-1000 chars. Hook as first line. Concrete, scannable. Ends with the CTA.
- Hashtags: 5-10, niche-relevant, lowercase, no #fyp / #foryou spam.
- CTA: one line, specific action.
- Pattern: pick from the allowed set. EACH OF THE 3 VARIANTS MUST USE A DIFFERENT PATTERN.
- Rationale: 1-2 sentences explaining why this rewrite outperforms the original.

Voice + virality grounding:
- Match the creator's tone — don't sound generic.
- Use the supplied "YOUR TOP HOOKS" as voice DNA — cadence, vocabulary.
- Use "VIRAL NICHE HOOKS" as proven scroll-stoppers — borrow structure, not exact words.
- If a "CONCEPT PAIRS" combo is relevant, weave both concepts into at least one variant.
- DO NOT just paraphrase the original — actually rewrite with a stronger angle.`;

function buildSignalBlock(signals: ViralSignals): string {
  const lines: string[] = [];
  if (signals.myTopHooks.length) {
    lines.push("YOUR TOP-PERFORMING HOOKS (use this voice/cadence):");
    signals.myTopHooks.forEach((h, i) => {
      lines.push(`  ${i + 1}. "${h.text}"${h.avgER != null ? ` (avg ER ${(h.avgER * 100).toFixed(1)}%)` : ""}`);
    });
  }
  if (signals.nicheViralHooks.length) {
    lines.push("");
    lines.push("VIRAL HOOKS IN YOUR NICHE (proven scroll-stoppers — borrow structure):");
    signals.nicheViralHooks.forEach((h, i) => {
      lines.push(`  ${i + 1}. "${h.text}" (${h.views.toLocaleString()} views)`);
    });
  }
  if (signals.conceptPairs.length) {
    lines.push("");
    lines.push("CONCEPT PAIRS THAT COMPOUND FOR YOUR AUDIENCE:");
    signals.conceptPairs.forEach((c) => {
      lines.push(`  - ${c.a} + ${c.b} (${c.lift.toFixed(1)}× lift)`);
    });
  }
  return lines.length ? lines.join("\n") : "(no viral signals available — go on craft alone)";
}

export async function fixPost(input: {
  originalCaption: string;
  originalHook: string | null;
  niche?: string | null;
  platform?: string;
  rating: PostScore;
  signals: ViralSignals;
  /** Abort the in-flight Claude call after a deadline (default: caller manages) */
  signal?: AbortSignal;
}): Promise<FixVariant[]> {
  assertAnthropicConfigured();

  const ctx = [
    `Platform: ${input.platform ?? "Instagram"}`,
    input.niche ? `Niche: ${input.niche}` : null,
    `Current rating: ${input.rating.score}/100 (${input.rating.band})`,
    `Diagnostic notes:`,
    ...input.rating.reasons.map((r) => `  - ${r}`),
    ``,
    buildSignalBlock(input.signals),
    ``,
    `ORIGINAL HOOK: ${input.originalHook ?? "(none extracted)"}`,
    `ORIGINAL CAPTION:`,
    input.originalCaption.slice(0, 4000),
  ].filter(Boolean).join("\n");

  // max_tokens lowered from 3500 → 1800: 3 variants × (hook + ~300char caption +
  // 5-10 tags + cta + rationale) ≈ 1500 tokens of JSON. Lower cap = lower P99
  // latency = doesn't hit Vercel's 60s function timeout on slow Claude responses.
  let res;
  try {
    res = await anthropic.messages.create(
      {
        model: MODELS.default,
        max_tokens: 1800,
        system: SYSTEM,
        messages: [
          {
            role: "user",
            content: `${ctx}\n\nGenerate 3 viral-tuned rewrite variants. Output ONLY the JSON object.`,
          },
        ],
      },
      input.signal ? { signal: input.signal } : undefined,
    );
  } catch (e) {
    // Preserve abort errors so the caller can detect a timeout vs an upstream
    // failure. Everything else is logged server-side and re-thrown as a stable
    // PostFixerError so raw SDK / network errors never leak to the UI.
    if (e instanceof Anthropic.APIUserAbortError) throw e;
    console.error("[post-fixer] anthropic call failed", e);
    throw new PostFixerError("Couldn't reach the AI service. Try again in a moment.", e);
  }

  const text = res.content
    .filter((b) => b.type === "text")
    .map((b) => (b as { text: string }).text)
    .join("")
    .replace(/^\s*```(?:json)?\s*\n?/i, "")
    .replace(/\n?```\s*$/i, "")
    .trim();

  const match = text.match(/\{[\s\S]*\}/);
  if (!match) {
    // Log the raw snippet for debugging, surface only a stable message.
    console.error("[post-fixer] no JSON in Claude response; first 500 chars:", text.slice(0, 500));
    throw new PostFixerError("AI returned an unparseable response. Try again.");
  }
  let parsed: { variants?: Partial<FixVariant>[] };
  try {
    parsed = JSON.parse(match[0]);
  } catch (e) {
    console.error(
      "[post-fixer] JSON.parse failed:",
      (e as Error).message,
      "snippet:",
      match[0].slice(0, 500),
    );
    throw new PostFixerError("AI returned malformed JSON. Try again.", e);
  }
  if (!Array.isArray(parsed.variants) || parsed.variants.length === 0) {
    console.error("[post-fixer] response had no variants. Parsed:", JSON.stringify(parsed).slice(0, 500));
    throw new PostFixerError("AI didn't return any variants. Try again.");
  }

  return parsed.variants.slice(0, 3).map((v) => ({
    hook: String(v.hook ?? "").trim(),
    caption: String(v.caption ?? "").trim(),
    hashtags: Array.isArray(v.hashtags)
      ? v.hashtags.map((h) => String(h).toLowerCase().replace(/^#/, "").trim()).filter(Boolean)
      : [],
    cta: String(v.cta ?? "").trim(),
    pattern: String(v.pattern ?? "").trim(),
    rationale: String(v.rationale ?? "").trim(),
  }));
}
