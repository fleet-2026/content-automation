import { runActor } from "@/lib/apify";
import { env } from "@/lib/env";

/**
 * Extract the actual downloadable video URL from a TikTok or Instagram
 * post URL. FlipIt's API only returns image thumbnails — not the video —
 * so this is a separate path used by the /flip "Download video" button.
 *
 * Strategy:
 *   - TikTok URLs → tikwm.com public API (free, no auth, low latency).
 *     Falls back to Apify clockworks~free-tiktok-scraper if tikwm fails.
 *   - Instagram URLs → Apify apify~instagram-post-scraper (we already
 *     have the Apify token configured).
 *   - Other URLs → returns null with reason so the UI can surface
 *     "unsupported platform" rather than a generic error.
 *
 * Returns the direct video URL so the client can either preview it in a
 * <video> tag or trigger a download via <a download>.
 */

export type VideoExtractResult = {
  ok: boolean;
  videoUrl?: string;
  thumbnailUrl?: string;
  /** Cleaner caption/author than what FlipIt provides for the same URL,
   *  since these scrapers go deeper into the platform metadata. */
  caption?: string;
  author?: string;
  duration?: number;
  source: "tikwm" | "apify-tiktok" | "apify-instagram" | "unsupported";
  error?: string;
};

const TIKTOK_HOSTS = ["tiktok.com", "vm.tiktok.com", "vt.tiktok.com"];
const INSTAGRAM_HOSTS = ["instagram.com", "www.instagram.com"];

function classifyHost(url: string): "tiktok" | "instagram" | "other" {
  try {
    const u = new URL(url);
    const host = u.hostname.replace(/^www\./, "");
    if (TIKTOK_HOSTS.some((h) => host === h || host.endsWith(`.${h}`))) {
      return "tiktok";
    }
    if (INSTAGRAM_HOSTS.some((h) => host === h)) return "instagram";
    return "other";
  } catch {
    return "other";
  }
}

/**
 * tikwm.com is a public TikTok mirror that returns the unwatermarked
 * video URL alongside metadata. No auth, no quotas published. 10s
 * AbortController timeout so a slow tikwm response doesn't eat the
 * Vercel function budget.
 */
async function tikwmExtract(url: string): Promise<VideoExtractResult> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 10_000);
  try {
    const res = await fetch(
      `https://www.tikwm.com/api/?url=${encodeURIComponent(url)}&hd=1`,
      {
        signal: ctrl.signal,
        cache: "no-store",
        headers: { "User-Agent": "Mozilla/5.0 (compatible; CreatorOS/1.0)" },
      },
    );
    if (!res.ok) {
      return {
        ok: false,
        source: "tikwm",
        error: `tikwm responded ${res.status}`,
      };
    }
    const json = (await res.json()) as {
      code?: number;
      data?: {
        play?: string;
        hdplay?: string;
        cover?: string;
        title?: string;
        author?: { unique_id?: string; nickname?: string };
        duration?: number;
      };
      msg?: string;
    };
    if (json.code !== 0 || !json.data) {
      return {
        ok: false,
        source: "tikwm",
        error: json.msg ?? "tikwm returned no data",
      };
    }
    return {
      ok: true,
      videoUrl: json.data.hdplay ?? json.data.play,
      thumbnailUrl: json.data.cover,
      caption: json.data.title,
      author: json.data.author?.unique_id ?? json.data.author?.nickname,
      duration: json.data.duration,
      source: "tikwm",
    };
  } catch (e) {
    if (ctrl.signal.aborted) {
      return { ok: false, source: "tikwm", error: "tikwm timeout (10s)" };
    }
    return {
      ok: false,
      source: "tikwm",
      error: e instanceof Error ? e.message : String(e),
    };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Apify TikTok scraper fallback. Used when tikwm fails OR is rate-
 * limited. Slower (~20-40s) but extremely reliable.
 */
async function apifyTiktokExtract(url: string): Promise<VideoExtractResult> {
  if (!env("APIFY_TOKEN")) {
    return {
      ok: false,
      source: "apify-tiktok",
      error: "APIFY_TOKEN not configured — set it in Vercel env to enable Apify fallback.",
    };
  }
  try {
    // clockworks/free-tiktok-scraper — free actor, returns the video URL
    // in `videoMeta.downloadAddr` and metadata fields.
    const items = await runActor<{
      videoUrl?: string;
      "videoMeta.downloadAddr"?: string;
      videoMeta?: { downloadAddr?: string; cover?: string; duration?: number };
      text?: string;
      authorMeta?: { name?: string; nickName?: string };
      covers?: { default?: string };
    }>(
      "clockworks~free-tiktok-scraper",
      { postURLs: [url], shouldDownloadVideos: false, shouldDownloadCovers: false, resultsPerPage: 1 },
      { timeoutSec: 90 },
    );
    const it = items[0];
    if (!it) {
      return { ok: false, source: "apify-tiktok", error: "Apify returned no items" };
    }
    const videoUrl =
      it.videoUrl ?? it["videoMeta.downloadAddr"] ?? it.videoMeta?.downloadAddr;
    if (!videoUrl) {
      return { ok: false, source: "apify-tiktok", error: "Apify item missing video URL" };
    }
    return {
      ok: true,
      videoUrl,
      thumbnailUrl: it.videoMeta?.cover ?? it.covers?.default,
      caption: it.text,
      author: it.authorMeta?.name ?? it.authorMeta?.nickName,
      duration: it.videoMeta?.duration,
      source: "apify-tiktok",
    };
  } catch (e) {
    return {
      ok: false,
      source: "apify-tiktok",
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

/**
 * Instagram extractor via Apify. Handles Reels, IG Video posts, and
 * single-image posts (videoUrl will be undefined for images — the
 * caller should fall back to thumbnail in that case).
 */
async function apifyInstagramExtract(url: string): Promise<VideoExtractResult> {
  if (!env("APIFY_TOKEN")) {
    return {
      ok: false,
      source: "apify-instagram",
      error: "APIFY_TOKEN not configured — set it in Vercel env to enable Instagram video extraction.",
    };
  }
  try {
    const items = await runActor<{
      videoUrl?: string;
      displayUrl?: string;
      caption?: string;
      ownerUsername?: string;
      videoDuration?: number;
    }>(
      "apify~instagram-post-scraper",
      { directUrls: [url], resultsLimit: 1 },
      { timeoutSec: 120 },
    );
    const it = items[0];
    if (!it) {
      return { ok: false, source: "apify-instagram", error: "Apify returned no items" };
    }
    if (!it.videoUrl) {
      return {
        ok: false,
        source: "apify-instagram",
        error: "Post has no video (looks like an image post — use the source images directly)",
        thumbnailUrl: it.displayUrl,
        caption: it.caption,
        author: it.ownerUsername,
      };
    }
    return {
      ok: true,
      videoUrl: it.videoUrl,
      thumbnailUrl: it.displayUrl,
      caption: it.caption,
      author: it.ownerUsername,
      duration: it.videoDuration,
      source: "apify-instagram",
    };
  } catch (e) {
    return {
      ok: false,
      source: "apify-instagram",
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

export async function extractVideoUrl(url: string): Promise<VideoExtractResult> {
  const kind = classifyHost(url);
  if (kind === "other") {
    return {
      ok: false,
      source: "unsupported",
      error:
        "Only TikTok and Instagram video URLs are supported for direct download right now.",
    };
  }
  if (kind === "tiktok") {
    // Try tikwm first (fast, no auth). If it fails or returns nothing,
    // fall back to Apify (slower, more reliable, costs Apify credits).
    const tw = await tikwmExtract(url);
    if (tw.ok) return tw;
    return await apifyTiktokExtract(url);
  }
  return await apifyInstagramExtract(url);
}
