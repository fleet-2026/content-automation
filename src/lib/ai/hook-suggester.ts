import { anthropic, MODELS, assertAnthropicConfigured } from "./claude";
import { embed, toPgVector } from "./embed";
import { prisma } from "@/lib/db";

export type HookVariant = {
  text: string;
  pattern: string | null;
  predictedER: number | null;
  similarHookIds: string[];
  reasoning?: string;
};

/**
 * Generate hook variants for a draft, predicting performance via kNN over
 * past hooks (yours weighted 2x, niche-wide 1x).
 */
export async function suggestHooks(input: {
  userId: string;
  topic: string;
  caption?: string;
  count?: number;
}): Promise<HookVariant[]> {
  assertAnthropicConfigured();
  const count = Math.min(input.count ?? 6, 10);

  // Pull "voice DNA" — your top 8 performing hooks as samples for Claude
  const yourTop = await prisma.$queryRaw<{ text: string; pattern: string | null; avg_er: number | null }[]>`
    SELECT h.text, h.pattern, h."avgEngagementRate" AS avg_er
      FROM hooks h
     WHERE h."ownerType" = 'MINE' AND h."avgEngagementRate" IS NOT NULL
     ORDER BY h."avgEngagementRate" DESC
     LIMIT 8
  `;

  const voiceSamples =
    yourTop.length > 0
      ? `\n\nYOUR TOP-PERFORMING HOOKS (use this voice/cadence):\n${yourTop.map((h, i) => `${i + 1}. "${h.text}"`).join("\n")}`
      : "";

  const system = `You generate scroll-stopping social media hooks for short-form video.

Output a JSON array of objects shaped:
[{ "text": "...", "pattern": "question|stat|story|controversy|promise|callout|curiosity_gap|numbered|command", "reasoning": "one short line" }]

Rules:
- 12 words max per hook.
- No emojis, no hashtags.
- Each variant should use a DIFFERENT pattern.
- Sound human, not corporate.
- Output ONLY the JSON array — no prose, no markdown fences, no extra keys.${voiceSamples}`;

  const user = `Topic: ${input.topic}
${input.caption ? `Context (caption draft): ${input.caption.slice(0, 800)}` : ""}

Generate ${count} distinct hook variants.`;

  const res = await anthropic.messages.create({
    model: MODELS.default,
    max_tokens: 1500,
    system,
    messages: [{ role: "user", content: user }],
  });

  const rawText = res.content
    .filter((b) => b.type === "text")
    .map((b) => (b as { text: string }).text)
    .join("");
  // Strip ```json … ``` fences if Claude wrapped the response.
  const text = rawText
    .replace(/^\s*```(?:json|javascript|js)?\s*\n?/i, "")
    .replace(/\n?```\s*$/i, "")
    .trim();
  const arr = text.match(/\[[\s\S]*\]/);
  if (!arr) {
    throw new Error(
      `Hook suggester: no JSON array in Claude response. First 200 chars: ${text.slice(0, 200)}`,
    );
  }
  let parsed: { text?: string; pattern?: string; reasoning?: string }[] = [];
  try {
    parsed = JSON.parse(arr[0]);
  } catch (e) {
    throw new Error(
      `Hook suggester: failed to parse JSON: ${(e as Error).message}. Snippet: ${arr[0].slice(0, 200)}`,
    );
  }
  if (!Array.isArray(parsed) || parsed.length === 0) {
    throw new Error(
      `Hook suggester: parsed but no variants returned. Got: ${JSON.stringify(parsed).slice(0, 200)}`,
    );
  }

  // Predict ER for each variant via kNN over hooks DB
  const variants: HookVariant[] = [];
  for (const p of parsed) {
    const hookText = String(p.text ?? "").trim();
    if (!hookText) continue;
    try {
      const vec = await embed(hookText);
      const neighbors = await prisma.$queryRawUnsafe<
        { id: string; distance: number; avg_er: number | null; weight: number }[]
      >(
        `SELECT h.id,
                h.embedding <=> $1::vector AS distance,
                h."avgEngagementRate" AS avg_er,
                CASE WHEN h."ownerType" = 'MINE' THEN 2.0 ELSE 1.0 END AS weight
           FROM hooks h
          WHERE h."avgEngagementRate" IS NOT NULL
          ORDER BY h.embedding <=> $1::vector
          LIMIT 6`,
        toPgVector(vec),
      );

      let predictedER: number | null = null;
      if (neighbors.length) {
        const totalW = neighbors.reduce((s, n) => s + Number(n.weight), 0);
        predictedER =
          neighbors.reduce(
            (s, n) => s + Number(n.weight) * Number(n.avg_er ?? 0),
            0,
          ) / Math.max(totalW, 0.001);
      }

      variants.push({
        text: hookText,
        pattern: p.pattern ?? null,
        predictedER,
        similarHookIds: neighbors.map((n) => n.id),
        reasoning: p.reasoning,
      });
    } catch {
      variants.push({
        text: hookText,
        pattern: p.pattern ?? null,
        predictedER: null,
        similarHookIds: [],
        reasoning: p.reasoning,
      });
    }
  }

  variants.sort((a, b) => (b.predictedER ?? -1) - (a.predictedER ?? -1));
  return variants;
}
