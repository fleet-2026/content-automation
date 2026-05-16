import { anthropic, MODELS, assertAnthropicConfigured } from "./claude";

export type RepurposeMoment = {
  startSec: number;
  endSec: number;
  hook: string;
  caption: string;
  whyItWorks: string;
};

/**
 * Given a long-form transcript with timestamps, extract 4-8 short-form moments
 * that would work as Reels/Shorts/TikToks. Each moment is 15-90 seconds.
 */
export async function extractRepurposeMoments(input: {
  transcript: string;
  segments?: { start: number; end: number; text: string }[];
  voiceSamples?: string[];
}): Promise<RepurposeMoment[]> {
  assertAnthropicConfigured();
  const segs = input.segments ?? [];
  const segText = segs.length
    ? segs.slice(0, 600).map((s) => `[${Math.round(s.start)}s] ${s.text}`).join("\n")
    : input.transcript;

  const voice = input.voiceSamples?.length
    ? `\nWrite hooks in this creator's proven voice — examples:\n${input.voiceSamples.map((v) => `- "${v}"`).join("\n")}\n`
    : "";

  const system = `You extract short-form-video moments from a long-form transcript.

Return JSON array shaped:
[{
  "startSec": number, "endSec": number,
  "hook": "first line for the short, max 12 words",
  "caption": "tight 1-3 sentence caption",
  "whyItWorks": "one short line"
}]

Rules:
- Each moment 15-90 seconds.
- Don't fabricate — use the actual content of the segment.
- Pick moments with a clear payoff (story turn, surprising fact, strong opinion).${voice}`;

  const res = await anthropic.messages.create({
    model: MODELS.default,
    max_tokens: 1500,
    system,
    messages: [
      {
        role: "user",
        content: `TRANSCRIPT:\n${segText.slice(0, 12000)}\n\nExtract 4-8 short-form moments.`,
      },
    ],
  });

  const text = res.content
    .filter((b) => b.type === "text")
    .map((b) => (b as { text: string }).text)
    .join("");
  const arr = text.match(/\[[\s\S]*\]/);
  if (!arr) return [];
  try {
    const parsed = JSON.parse(arr[0]) as RepurposeMoment[];
    return parsed.filter((m) => m.endSec > m.startSec && m.hook && m.caption);
  } catch {
    return [];
  }
}
