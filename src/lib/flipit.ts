/**
 * FlipIt API client.
 * Live at https://flipit-app.netlify.app/.netlify/functions/<name>.
 * CORS-open. All POST + JSON unless noted. Free tier: 3 flips/day per IP.
 *
 * Pro auth: pass `FLIPIT_PRO_TOKEN` env var (HMAC token from Stripe flow) to
 * unlock Pro quotas. We forward it as `X-Flipit-Pro` on every call.
 */

const BASE =
  process.env.NEXT_PUBLIC_FLIPIT_BASE ??
  process.env.FLIPIT_BASE ??
  "https://flipit-app.netlify.app/.netlify/functions";

function headers(): HeadersInit {
  const h: Record<string, string> = { "Content-Type": "application/json" };
  const tok = process.env.NEXT_PUBLIC_FLIPIT_PRO_TOKEN ?? process.env.FLIPIT_PRO_TOKEN;
  if (tok) h["X-Flipit-Pro"] = tok;
  return h;
}

async function call<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${BASE}/${path}`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify(body),
    cache: "no-store",
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(`FlipIt ${path} ${res.status}: ${txt.slice(0, 300)}`);
  }
  return (await res.json()) as T;
}

// ─── Endpoints ───────────────────────────────────────────────

export type ExtractAndTwist = {
  original: string;
  twisted: string;
  prompt?: string;
  /** Image URLs from the source post (carousel slides, single-image post, or video thumbnail). */
  sourceImages?: string[];
  /** Single thumbnail (often video poster). */
  thumbnail?: string;
  /** Echo of the source URL the backend extracted from. */
  sourceUrl?: string;
};
export function extractAndTwist(url: string) {
  return call<ExtractAndTwist>("extract-and-twist", { url });
}

export type RewriteScript = { rewritten: string; hook: string; cta: string };
export function rewriteScript(input: { script: string; tone?: string; platform?: string }) {
  return call<RewriteScript>("rewrite-script", input);
}

export type NicheIdeas = { twisted: string; prompt?: string };
export function nicheIdeas(input: { niche: string; description: string }) {
  return call<NicheIdeas>("niche-ideas", input);
}

export type ImagePrompt = { label: string; prompt: string };
export function imagePrompts(
  input:
    | { flippedScript: string; count?: number }
    | { niche: string; event?: string; customEvent?: string; style?: string; count?: number; extra?: string },
) {
  return call<{ prompts: ImagePrompt[] }>("image-prompts", input);
}

export type VideoPrompt = { label: string; prompt: string };
export function videoPrompts(input: { flippedScript: string; platform?: string }) {
  return call<{ prompts: VideoPrompt[] }>("video-prompts", input);
}

export type AnalyzeImage = { prompt: string };
export function analyzeImage(input: { imageUrl: string; slideNumber?: number }) {
  return call<AnalyzeImage>("analyze-image", input);
}

export type TrendingResult = {
  url?: string;
  caption?: string;
  views?: number;
  likes?: number;
  comments?: number;
  shares?: number;
  author?: string;
  thumbnailUrl?: string;
  // Apify fields are loose — keep extras
  [k: string]: unknown;
};
export function trending(input: { niche?: string; hashtag?: string; count?: number }) {
  return call<{ results: TrendingResult[]; source: string }>("trending", input);
}
