import { safeFetch } from "@/lib/safe-fetch";

/**
 * Scrape the user's external "link hub" page (e.g. earnwith-ai.com/all-links)
 * and return the individual links for quick access on the dashboard.
 *
 * Cached in-process for 5 minutes so we don't hit the hub page on every
 * dashboard render. The cache is per-Vercel-function-instance (good enough
 * for personal use; switch to runtime-cache for global cache later).
 */

export type MyLink = {
  text: string;
  href: string;
  /** True if it points back to the hub itself (skip in UI). */
  isSelf?: boolean;
};

export type MyLinksResult = {
  hubUrl: string;
  hubTitle: string;       // <title> from the page, or hostname fallback
  fetchedAt: number;
  links: MyLink[];
  error?: string;
};

function extractPageTitle(html: string, fallbackUrl: string): string {
  const m = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  if (m) {
    const raw = m[1]
      .replace(/<[^>]+>/g, "")
      .replace(/\s+/g, " ")
      .trim();
    const decoded = raw
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'");
    if (decoded) return decoded.slice(0, 80);
  }
  try {
    return new URL(fallbackUrl).hostname.replace(/^www\./, "");
  } catch {
    return fallbackUrl;
  }
}

const CACHE_TTL_MS = 5 * 60 * 1000;
// Cache per-URL since we now support multiple hubs.
const cache = new Map<string, MyLinksResult>();
// Hard cap so a misconfigured env (many rotating URLs) can't grow the map
// unbounded across the Vercel function instance's lifetime.
const CACHE_MAX_ENTRIES = 50;

function cacheSet(key: string, result: MyLinksResult) {
  if (cache.size >= CACHE_MAX_ENTRIES) {
    // Simple eviction: drop oldest insertion (Map iterates in insertion order).
    const firstKey = cache.keys().next().value;
    if (firstKey !== undefined) cache.delete(firstKey);
  }
  cache.set(key, result);
}

/**
 * Default hubs surfaced on the dashboard. Override via env:
 *   MY_LINKS_URL=https://hub1.com,https://hub2.com,...
 */
const DEFAULT_HUB_URLS = [
  "https://earnwith-ai.com/links",
  "https://ayla-prompts-dashboard.netlify.app/",
];

export function getHubUrls(): string[] {
  const raw = process.env.MY_LINKS_URL?.trim();
  const list = raw
    ? raw
        .split(",")
        .map((u) => u.trim())
        .filter(Boolean)
    : DEFAULT_HUB_URLS;
  // Dedupe while preserving order
  const seen = new Set<string>();
  return list.filter((u) => (seen.has(u) ? false : (seen.add(u), true)));
}

/** @deprecated kept for backward compat — returns the first hub URL */
export function getHubUrl(): string {
  return getHubUrls()[0] ?? "";
}

/**
 * Decode HTML entities in scraped link text (&amp; → &, &#39; → ', etc.).
 * Tiny set — covers the common ones without pulling a library.
 */
function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)));
}

function stripTags(s: string): string {
  return s.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
}

/**
 * Parse anchor tags out of HTML. Handles:
 *  - Single + double quoted href attributes
 *  - Nested inline tags inside the anchor body (<a><span>text</span></a>)
 *  - Resolves relative URLs against the base
 *  - Filters out hash-only, mailto:, tel:, javascript:, and the hub URL itself
 *  - Deduplicates by absolute URL
 *
 * ReDoS guard: the [\s\S]*? in the regex can backtrack catastrophically on
 * pathological inputs (many `<a href="...">` with no closing `</a>`). Cap
 * input to ~500KB before the regex — covers any legit link-hub page and
 * keeps the worst case bounded to a few ms.
 */
const MAX_HTML_BYTES = 500_000;

function extractLinks(html: string, baseUrl: string): MyLink[] {
  const base = new URL(baseUrl);
  const safeHtml = html.length > MAX_HTML_BYTES ? html.slice(0, MAX_HTML_BYTES) : html;
  const anchorRe = /<a\b[^>]*\bhref\s*=\s*("([^"]*)"|'([^']*)')[^>]*>([\s\S]*?)<\/a>/gi;
  const seen = new Set<string>();
  const out: MyLink[] = [];

  let m: RegExpExecArray | null;
  while ((m = anchorRe.exec(safeHtml)) !== null) {
    const rawHref = (m[2] ?? m[3] ?? "").trim();
    if (!rawHref) continue;
    if (
      rawHref.startsWith("#") ||
      rawHref.startsWith("javascript:") ||
      rawHref.startsWith("mailto:") ||
      rawHref.startsWith("tel:") ||
      rawHref.startsWith("data:")
    ) {
      continue;
    }

    let abs: URL;
    try {
      abs = new URL(rawHref, base);
    } catch {
      continue;
    }
    if (abs.protocol !== "https:" && abs.protocol !== "http:") continue;

    const absStr = abs.toString();
    if (seen.has(absStr)) continue;
    seen.add(absStr);

    const text = decodeEntities(stripTags(m[4] ?? "")).slice(0, 200);
    if (!text) continue;

    // Treat as "self" if it points back to the hub itself OR to the bare
    // site root (most link-hub pages have a "back to homepage" footer link).
    // BUT: hash-fragment links (e.g. /#about, /#skills) are separate
    // destinations even though they share pathname — keep them.
    const isSelf =
      abs.origin === base.origin &&
      !abs.hash &&
      (abs.pathname === base.pathname ||
        absStr === baseUrl ||
        abs.pathname === "/" ||
        abs.pathname === "");

    out.push({ text, href: absStr, isSelf });
  }
  return out;
}

async function fetchOneHub(url: string): Promise<MyLinksResult> {
  if (!url) {
    return { hubUrl: "", hubTitle: "", fetchedAt: Date.now(), links: [] };
  }

  // Serve from cache if fresh
  const now = Date.now();
  const cached = cache.get(url);
  if (cached && now - cached.fetchedAt < CACHE_TTL_MS) {
    return cached;
  }

  const hostnameFallback = (() => {
    try {
      return new URL(url).hostname.replace(/^www\./, "");
    } catch {
      return url;
    }
  })();

  try {
    const r = await safeFetch(url, {
      maxBytes: 2 * 1024 * 1024, // most link-hub pages are well under this
      timeoutMs: 8000,
    });
    const html = r.buffer.toString("utf8");
    const links = extractLinks(html, url).filter((l) => !l.isSelf);
    const result: MyLinksResult = {
      hubUrl: url,
      hubTitle: extractPageTitle(html, url),
      fetchedAt: now,
      links: links.slice(0, 30), // cap for sanity
    };
    cacheSet(url, result);
    return result;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const result: MyLinksResult = {
      hubUrl: url,
      hubTitle: hostnameFallback,
      fetchedAt: now,
      links: [],
      error: msg,
    };
    // Cache the failure briefly too, so a flaky hub doesn't drag dashboard load
    cacheSet(url, result);
    return result;
  }
}

/** Fetch every configured hub in parallel. */
export async function fetchAllHubs(): Promise<MyLinksResult[]> {
  const urls = getHubUrls();
  if (urls.length === 0) return [];
  return Promise.all(urls.map((u) => fetchOneHub(u)));
}

/** @deprecated single-hub variant — use fetchAllHubs() */
export async function fetchMyLinks(): Promise<MyLinksResult> {
  const hubs = await fetchAllHubs();
  return hubs[0] ?? { hubUrl: "", fetchedAt: Date.now(), links: [] };
}
