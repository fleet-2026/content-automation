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
  /** Which path produced this result — useful for the UI to surface
   *  "served via fallback because FlipIt was down" type messaging. */
  source?: "flipit" | "native";
};

/**
 * Extract + flip a viral post. Tries FlipIt's hosted API first because
 * it's purpose-built for this and returns the cleanest output. When
 * FlipIt is down (502 from their Netlify functions has been observed),
 * falls back to our own pipeline:
 *   1. Apify scraper extracts caption + images from the post URL
 *   2. Claude rewrites the caption into a "flipped" viral version
 *
 * The fallback works for TikTok and Instagram URLs. YouTube / X / LinkedIn
 * URLs still depend on FlipIt and will error if FlipIt is down — for now.
 */
export async function extractAndTwist(url: string): Promise<ExtractAndTwist> {
  try {
    const r = await call<ExtractAndTwist>("extract-and-twist", { url });
    return { ...r, source: "flipit" };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.warn("[flipit] extract-and-twist failed, falling back to native:", msg);
    // Lazy-import the fallback so it doesn't pull Apify + Claude SDKs
    // into route bundles that never hit the fallback path. Apify is
    // ~2MB of types alone.
    const { extractAndTwistNative } = await import("@/lib/flipit-native");
    return await extractAndTwistNative(url);
  }
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
