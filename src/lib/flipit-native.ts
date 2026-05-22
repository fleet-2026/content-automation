import { runActor } from "@/lib/apify";
import { rewriteScriptWithClaude } from "@/lib/ai/native-prompts";
import { env } from "@/lib/env";
import type { ExtractAndTwist } from "@/lib/flipit";

/**
 * Native (FlipIt-free) URL extract + flip pipeline.
 *
 * Used as a fallback when FlipIt's hosted API (flipit-app.netlify.app)
 * returns 5xx. The chain:
 *   1. classifyHost(url) → tiktok | instagram | unsupported
 *   2. Apify scraper pulls caption + image(s) from the post URL
 *   3. Claude rewrites the caption into a "flipped" viral version
 *   4. Returns the same shape FlipIt would have returned
 *
 * Failure modes propagate up with clear messages so the UI can show
 * the real reason instead of the generic "Server Components render"
 * fallback.
 */

const TIKTOK_HOSTS = ["tiktok.com", "vm.tiktok.com", "vt.tiktok.com"];
const INSTAGRAM_HOSTS = ["instagram.com", "www.instagram.com"];

function classifyHost(url: string): "tiktok" | "instagram" | "other" {
  try {
    const u = new URL(url);
    const host = u.hostname.replace(/^www\./, "");
    if (TIKTOK_HOSTS.some((h) => host === h || host.endsWith(`.${h}`))) return "tiktok";
    if (INSTAGRAM_HOSTS.some((h) => host === h)) return "instagram";
    return "other";
  } catch {
    return "other";
  }
}

// Loose IG scrape shape — only the fields we actually read. The
// Apify Instagram scraper returns dozens more; we don't care about most.
type IGScraped = {
  caption?: string;
  displayUrl?: string;
  videoUrl?: string;
  // For carousels: array of child slides, each with its own displayUrl
  childPosts?: Array<{ displayUrl?: string; videoUrl?: string }>;
  // Some IG scrape variants flatten images directly:
  images?: string[];
};

type TTScraped = {
  text?: string;
  videoMeta?: { cover?: string };
  covers?: { default?: string };
};

async function scrapeInstagramPost(url: string): Promise<IGScraped | null> {
  if (!env("APIFY_TOKEN")) {
    throw new Error(
      "APIFY_TOKEN not configured. The native FlipIt fallback uses Apify to scrape Instagram posts — add APIFY_TOKEN to Vercel env vars.",
    );
  }
  const items = await runActor<IGScraped>(
    "apify/instagram-scraper",
    {
      directUrls: [url],
      resultsType: "posts",
      resultsLimit: 1,
      addParentData: false,
    },
    { timeoutSec: 120 },
  );
  return items[0] ?? null;
}

async function scrapeTikTokPost(url: string): Promise<TTScraped | null> {
  if (!env("APIFY_TOKEN")) {
    throw new Error(
      "APIFY_TOKEN not configured. The native FlipIt fallback uses Apify — add APIFY_TOKEN to Vercel env vars.",
    );
  }
  const items = await runActor<TTScraped>(
    "clockworks~free-tiktok-scraper",
    {
      postURLs: [url],
      shouldDownloadVideos: false,
      shouldDownloadCovers: false,
      resultsPerPage: 1,
    },
    { timeoutSec: 120 },
  );
  return items[0] ?? null;
}

export async function extractAndTwistNative(url: string): Promise<ExtractAndTwist> {
  const kind = classifyHost(url);
  if (kind === "other") {
    throw new Error(
      "FlipIt is currently unavailable and our fallback only supports Instagram + TikTok URLs. Try again later when FlipIt is back online.",
    );
  }

  // ── 1. Scrape the post
  let caption = "";
  let sourceImages: string[] = [];
  let thumbnail: string | undefined;

  if (kind === "instagram") {
    const post = await scrapeInstagramPost(url);
    if (!post) {
      throw new Error("Couldn't scrape this Instagram post. The URL may be private or invalid.");
    }
    caption = post.caption?.trim() ?? "";
    // Carousel children > single displayUrl > images array fallback
    if (post.childPosts && post.childPosts.length > 0) {
      sourceImages = post.childPosts
        .map((c) => c.displayUrl)
        .filter((u): u is string => !!u);
    } else if (post.images && post.images.length > 0) {
      sourceImages = post.images;
    } else if (post.displayUrl) {
      sourceImages = [post.displayUrl];
    }
    thumbnail = post.displayUrl;
  } else {
    const post = await scrapeTikTokPost(url);
    if (!post) {
      throw new Error("Couldn't scrape this TikTok post. The URL may be private or invalid.");
    }
    caption = post.text?.trim() ?? "";
    thumbnail = post.videoMeta?.cover ?? post.covers?.default;
    if (thumbnail) sourceImages = [thumbnail];
  }

  if (!caption) {
    throw new Error(
      "Scraped the post but it has no caption text to flip. Try a post with a written caption.",
    );
  }

  // ── 2. Flip the caption with Claude
  let twisted = "";
  try {
    const rewrite = await rewriteScriptWithClaude({
      script: caption,
      tone: "punchy",
      platform: kind === "tiktok" ? "TikTok" : "Instagram",
    });
    // rewriteScriptWithClaude returns { rewritten, hook, cta }
    twisted = rewrite.rewritten;
  } catch (e) {
    throw new Error(
      `Scraped the caption successfully but Claude rewrite failed: ${e instanceof Error ? e.message : String(e)}`,
    );
  }

  return {
    original: caption,
    twisted,
    sourceImages,
    thumbnail,
    sourceUrl: url,
    source: "native",
  };
}
