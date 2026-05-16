import { anthropic, MODELS, assertAnthropicConfigured } from "./claude";

const HOOK_PATTERNS = [
  "question",
  "stat",
  "story",
  "controversy",
  "promise",
  "callout",
  "curiosity_gap",
  "numbered",
  "command",
] as const;

export type HookPattern = (typeof HOOK_PATTERNS)[number];

export type ExtractedHook = {
  hookText: string;
  pattern: HookPattern | null;
  topic: string | null;
  conceptTags: string[];
};

const SYSTEM = `You analyze short-form social posts. Output strict JSON, no prose.

Extract:
- "hookText": the opening line that grabs attention. For a transcript or caption, use the FIRST sentence (or first ~12 words). Trim aggressively. No emojis, no hashtags.
- "pattern": one of [${HOOK_PATTERNS.join(", ")}] or null if unclear.
- "topic": a 2–4 word noun phrase describing what the post is about.
- "conceptTags": 1–4 lowercased single-word tags (no #), e.g. ["productivity","habits"].

If the input is empty or has no real text content, return all fields as empty strings or empty arrays.`;

export async function extractHook(input: {
  caption?: string | null;
  transcript?: string | null;
}): Promise<ExtractedHook> {
  assertAnthropicConfigured();
  const source =
    (input.transcript?.trim() ? `TRANSCRIPT:\n${input.transcript}\n\n` : "") +
    (input.caption?.trim() ? `CAPTION:\n${input.caption}` : "");

  if (!source.trim()) {
    return { hookText: "", pattern: null, topic: null, conceptTags: [] };
  }

  const res = await anthropic.messages.create({
    model: MODELS.fast,
    max_tokens: 400,
    system: SYSTEM,
    messages: [{ role: "user", content: source.slice(0, 6000) }],
  });

  const text = res.content
    .filter((b) => b.type === "text")
    .map((b) => (b as { text: string }).text)
    .join("");

  const json = text.match(/\{[\s\S]*\}/);
  if (!json) return { hookText: "", pattern: null, topic: null, conceptTags: [] };

  try {
    const parsed = JSON.parse(json[0]) as Partial<ExtractedHook> & { pattern?: string };
    const pattern =
      typeof parsed.pattern === "string" && (HOOK_PATTERNS as readonly string[]).includes(parsed.pattern)
        ? (parsed.pattern as HookPattern)
        : null;
    return {
      hookText: String(parsed.hookText ?? "").slice(0, 280),
      pattern,
      topic: parsed.topic ? String(parsed.topic).slice(0, 60) : null,
      conceptTags: Array.isArray(parsed.conceptTags)
        ? parsed.conceptTags.map((t) => String(t).toLowerCase()).slice(0, 4)
        : [],
    };
  } catch {
    return { hookText: "", pattern: null, topic: null, conceptTags: [] };
  }
}
