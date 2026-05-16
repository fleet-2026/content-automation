import { anthropic, MODELS, assertAnthropicConfigured } from "./claude";
import { safeFetch } from "@/lib/safe-fetch";

/**
 * Native prompt generators powered by Claude.
 * Replaces FlipIt's image/video/script/ideas endpoints with local calls.
 */

// ─── IMAGE PROMPTS ─────────────────────────────────────────────

const IMAGE_PROMPT_SYSTEM = `You write Midjourney / DALL-E ready image prompts for short-form social posts.

Output a JSON array shaped:
[{ "label": "📸 Slide 1 — Hook/Cover", "prompt": "..." }, ...]

For each prompt:
- 60-130 words
- Camera angle, lighting, color palette, composition, mood
- End with Midjourney parameters: \`--ar 4:5 --style raw --v 6.1\` (or 9:16 for video stills)
- Concrete and visual — no abstractions
- Different angle/composition per slide so they form a carousel`;

export type ImagePrompt = { label: string; prompt: string };

/**
 * Try to fetch an image and return its base64 + media type so Claude can
 * reliably read it. Uses safeFetch to block SSRF — user-supplied URLs cannot
 * reach localhost / private IPs / cloud metadata. Returns null on any
 * failure (including SSRF block), so the caller can skip that slide.
 */
async function fetchImageAsBase64(url: string): Promise<
  | { type: "base64"; mediaType: "image/jpeg" | "image/png" | "image/webp" | "image/gif"; data: string }
  | null
> {
  try {
    const r = await safeFetch(url, { maxBytes: 4 * 1024 * 1024, timeoutMs: 15_000 });
    const ct = r.contentType.toLowerCase();
    const mediaType = (
      ct.includes("png")
        ? "image/png"
        : ct.includes("webp")
          ? "image/webp"
          : ct.includes("gif")
            ? "image/gif"
            : "image/jpeg"
    ) as "image/jpeg" | "image/png" | "image/webp" | "image/gif";
    return { type: "base64", mediaType, data: r.buffer.toString("base64") };
  } catch {
    return null;
  }
}

type AnthropicImageBlock = {
  type: "image";
  source: {
    type: "base64";
    media_type: "image/jpeg" | "image/png" | "image/webp" | "image/gif";
    data: string;
  };
};

type AnthropicTextBlock = { type: "text"; text: string };

export async function generateImagePrompts(input: {
  flippedScript?: string;
  niche?: string;
  event?: string;
  customEvent?: string;
  style?: string;
  count?: number;
  extra?: string;
  /** When provided, Claude will analyze these and base prompts on what's actually visible. */
  sourceImages?: string[];
}): Promise<ImagePrompt[]> {
  assertAnthropicConfigured();
  const count = Math.min(input.count ?? 4, 8);

  const context = input.flippedScript
    ? `SCRIPT:\n${input.flippedScript.slice(0, 4000)}`
    : `NICHE: ${input.niche ?? "—"}\nEVENT: ${input.customEvent || input.event || "—"}\nSTYLE: ${input.style ?? "photorealistic"}\nEXTRAS: ${input.extra ?? "—"}`;

  // If carousel/source images were provided, attach them as vision blocks so
  // the resulting prompts describe the *actual visible content* rather than
  // a generic interpretation of the caption. Anthropic SDK requires base64
  // image blocks, so we fetch + encode here. If a fetch fails (e.g. expired
  // Instagram CDN signature), we skip that slide rather than break the call.
  const visionBlocks: AnthropicImageBlock[] = [];
  let skipped = 0;
  if (input.sourceImages && input.sourceImages.length > 0) {
    const sliced = input.sourceImages.slice(0, 6); // cap to keep tokens sane
    for (const src of sliced) {
      const b64 = await fetchImageAsBase64(src);
      if (b64) {
        visionBlocks.push({
          type: "image",
          source: {
            type: "base64",
            media_type: b64.mediaType,
            data: b64.data,
          },
        });
      } else {
        skipped++;
      }
    }
  }

  const visionInstruction =
    visionBlocks.length > 0
      ? `\n\nIMPORTANT: ${visionBlocks.length} reference image(s) are attached${skipped ? ` (${skipped} could not be fetched and were skipped)` : ""}. For each prompt, anchor your description in what is ACTUALLY visible in the corresponding slide (subjects, setting, color palette, framing, props, text overlays, mood). Do not invent details that aren't in the source. The flipped script tells you the angle; the images tell you the visual reality.`
      : "";

  const userBlocks: (AnthropicTextBlock | AnthropicImageBlock)[] = [
    ...visionBlocks,
    {
      type: "text",
      text: `${context}\n\nGenerate ${count} image prompts that work as a carousel (Hook/Cover, Problem, Insight, Result/CTA pattern when count >= 4).${visionInstruction}`,
    },
  ];

  const res = await anthropic.messages.create({
    model: MODELS.default,
    max_tokens: 3000,
    system: IMAGE_PROMPT_SYSTEM,
    messages: [{ role: "user", content: userBlocks }],
  });

  return parseJsonArray<ImagePrompt>(res);
}

// ─── VIDEO PROMPTS ─────────────────────────────────────────────

const VIDEO_PROMPT_SYSTEM = `You write video generation prompts for AI tools like Runway, Pika, Sora, Veo, and Kling.

Output a JSON array shaped:
[{ "label": "🎬 Main shot", "prompt": "..." }, { "label": "🎞 B-Roll", "prompt": "..." }, { "label": "✂ Transition", "prompt": "..." }]

For each prompt:
- 40-100 words
- Subject, camera movement (dolly, pan, tilt, crane, push-in), shot type (close-up, wide, medium), lighting, mood
- Match the platform's strength (Runway = realism, Pika = animation, Sora = long takes)
- Vertical 9:16 unless platform is YouTube`;

export type VideoPrompt = { label: string; prompt: string };

export async function generateVideoPrompts(input: {
  flippedScript: string;
  platform?: string;
}): Promise<VideoPrompt[]> {
  assertAnthropicConfigured();
  const res = await anthropic.messages.create({
    model: MODELS.default,
    max_tokens: 1500,
    system: VIDEO_PROMPT_SYSTEM,
    messages: [
      {
        role: "user",
        content: `Target generator: ${input.platform ?? "Runway"}\n\nSCRIPT:\n${input.flippedScript.slice(0, 4000)}\n\nGenerate 3 prompts: Main shot, B-Roll, Transition.`,
      },
    ],
  });
  return parseJsonArray<VideoPrompt>(res);
}

// ─── SCRIPT REWRITE ───────────────────────────────────────────

const REWRITE_SYSTEM = `You rewrite social media scripts for virality on a target platform.

Output strict JSON:
{
  "rewritten": "The full rewritten script — punchy, scroll-stopping, sounds human.",
  "hook": "First 8-12 words that stop the scroll.",
  "cta": "A single line CTA — clear, actionable, no fluff."
}

Rules:
- Match the user's tone and platform conventions
- Cut filler words, keep facts and concrete details
- No hashtags in the rewritten text (we add them separately)
- No emojis unless the tone calls for it`;

export type RewrittenScript = { rewritten: string; hook: string; cta: string };

export async function rewriteScriptWithClaude(input: {
  script: string;
  tone?: string;
  platform?: string;
}): Promise<RewrittenScript> {
  assertAnthropicConfigured();
  const res = await anthropic.messages.create({
    model: MODELS.default,
    max_tokens: 1500,
    system: REWRITE_SYSTEM,
    messages: [
      {
        role: "user",
        content: `Tone: ${input.tone ?? "punchy"}\nPlatform: ${input.platform ?? "TikTok"}\n\nORIGINAL:\n${input.script}`,
      },
    ],
  });
  return parseJsonObject<RewrittenScript>(res);
}

// ─── NICHE IDEAS ──────────────────────────────────────────────

const IDEAS_SYSTEM = `You generate viral content ideas for creators in a specific niche.

Output strict JSON:
{
  "twisted": "1. First idea — full hook + body sketch (3-4 sentences)\\n\\n2. Second idea — ...\\n\\n3. Third idea — ..."
}

Rules:
- 3 ideas, each scroll-stopping, contrarian when possible
- Anchor every idea to the niche — no generic 'productivity tips'
- Sound like the creator, not a bot
- Include specific hooks (first 12 words) for each idea
- Output ONLY the JSON object — no prose, no markdown fences, no extra fields`;

export type NicheIdeasOutput = { twisted: string };

export async function generateNicheIdeas(input: {
  niche: string;
  description: string;
}): Promise<NicheIdeasOutput> {
  assertAnthropicConfigured();
  const res = await anthropic.messages.create({
    model: MODELS.default,
    max_tokens: 1500,
    system: IDEAS_SYSTEM,
    messages: [
      {
        role: "user",
        content: `NICHE: ${input.niche}\nANGLE: ${input.description}\n\nGenerate 3 viral content ideas.`,
      },
    ],
  });
  return parseJsonObject<NicheIdeasOutput>(res);
}

// ─── helpers ──────────────────────────────────────────────────

function extractText(res: { content: Array<{ type: string; text?: string }> }): string {
  return res.content
    .filter((b) => b.type === "text")
    .map((b) => b.text ?? "")
    .join("");
}

// Strip ```json … ``` or ``` … ``` fences if Claude wraps the response.
function stripCodeFences(s: string): string {
  return s
    .replace(/^\s*```(?:json|javascript|js)?\s*\n?/i, "")
    .replace(/\n?```\s*$/i, "")
    .trim();
}

function parseJsonArray<T>(res: { content: Array<{ type: string; text?: string }> }): T[] {
  const raw = stripCodeFences(extractText(res));
  const m = raw.match(/\[[\s\S]*\]/);
  if (!m) {
    throw new Error(
      `No JSON array in Claude response. First 200 chars: ${raw.slice(0, 200)}`,
    );
  }
  try {
    return JSON.parse(m[0]) as T[];
  } catch (e) {
    throw new Error(
      `Failed to parse Claude JSON array: ${(e as Error).message}. Snippet: ${m[0].slice(0, 200)}`,
    );
  }
}

function parseJsonObject<T>(res: { content: Array<{ type: string; text?: string }> }): T {
  const raw = stripCodeFences(extractText(res));
  const m = raw.match(/\{[\s\S]*\}/);
  if (!m) {
    throw new Error(
      `No JSON object in Claude response. First 200 chars: ${raw.slice(0, 200)}`,
    );
  }
  try {
    return JSON.parse(m[0]) as T;
  } catch (e) {
    throw new Error(
      `Failed to parse Claude JSON object: ${(e as Error).message}. Snippet: ${m[0].slice(0, 200)}`,
    );
  }
}
