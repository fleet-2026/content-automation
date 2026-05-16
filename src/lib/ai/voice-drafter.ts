import { anthropic, MODELS, assertAnthropicConfigured } from "./claude";
import { getSimilarVoiceSamples, type VoiceSample } from "@/lib/brand-voice";

export type CaptionDraft = {
  caption: string;
  hook: string;
  hashtags: string[];
  rationale: string;
};

const SYSTEM_BASE = `You write Instagram captions in a creator's exact voice.

Output strict JSON:
{
  "drafts": [
    { "hook": "first line that stops the scroll, max 12 words",
      "caption": "the full caption — sound like THE CREATOR, not a brand. 80-220 words. Plain text, line breaks OK.",
      "hashtags": ["niche-relevant", "lowercase", "4-8 tags"],
      "rationale": "one short sentence on what makes this draft work"
    },
    ... 3 total drafts
  ]
}

Rules:
- Match the creator's voice from the BRAND VOICE SAMPLES exactly — cadence, sentence length, slang, capitalization, line break habits.
- Each draft uses a different angle (e.g. story / contrarian / promise).
- No emojis unless samples use them.
- No "click the link in bio" — natural CTAs only.
- Hashtags are useful, not spammy.`;

/**
 * Generate 3 IG caption drafts in the user's voice.
 * Pulls top-K voice samples by similarity to the thought, uses them as
 * one-shot voice context for Claude.
 */
export async function generateVoiceDrafts(input: {
  userId: string;
  thought: string;
  k?: number;
}): Promise<{ drafts: CaptionDraft[]; samplesUsed: VoiceSample[] }> {
  assertAnthropicConfigured();
  const thought = input.thought.trim();
  if (!thought) throw new Error("Empty thought");

  const samplesUsed = await getSimilarVoiceSamples(input.userId, thought, input.k ?? 5);

  const voiceBlock = samplesUsed.length
    ? `\n\nBRAND VOICE SAMPLES (write in this voice):\n${samplesUsed
        .map((s, i) => `[Sample ${i + 1}]\n${s.text}`)
        .join("\n\n")}`
    : `\n\nBRAND VOICE SAMPLES: (none yet — write in a punchy, human, modern creator voice)`;

  const res = await anthropic.messages.create({
    model: MODELS.default,
    max_tokens: 2500,
    system: SYSTEM_BASE + voiceBlock,
    messages: [
      {
        role: "user",
        content: `RAW THOUGHT:\n${thought.slice(0, 4000)}\n\nGenerate 3 caption drafts.`,
      },
    ],
  });

  const text = res.content
    .filter((b) => b.type === "text")
    .map((b) => (b as { text: string }).text)
    .join("");
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) return { drafts: [], samplesUsed };

  try {
    const parsed = JSON.parse(m[0]) as { drafts: CaptionDraft[] };
    const drafts = (parsed.drafts ?? []).map((d) => ({
      caption: String(d.caption ?? "").slice(0, 2200),
      hook: String(d.hook ?? "").slice(0, 280),
      hashtags: Array.isArray(d.hashtags)
        ? d.hashtags.map((h) => String(h).replace(/^#/, "").toLowerCase()).slice(0, 12)
        : [],
      rationale: String(d.rationale ?? ""),
    }));
    return { drafts, samplesUsed };
  } catch {
    return { drafts: [], samplesUsed };
  }
}
