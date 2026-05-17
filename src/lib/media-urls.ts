/**
 * Multi-image helper.
 *
 * The Draft schema currently has a single `mediaUrl: String?` field. To
 * support carousels (multiple images per post) without forcing a Prisma
 * migration mid-session, we pack the list of URLs into that one field
 * separated by `\n`. The first URL is treated as the "primary" — used
 * for the thumbnail, the hook-on-image overlay editor, single-platform
 * publishing fallback, and any place that historically expected a single
 * URL.
 *
 * If/when a proper `mediaUrls String[]` column lands on Draft, only
 * `parse` / `pack` need to change — every caller already speaks arrays.
 */

const SEP = "\n";

export function parseMediaUrls(stored: string | null | undefined): string[] {
  if (!stored) return [];
  return stored
    .split(SEP)
    .map((u) => u.trim())
    .filter((u) => /^https?:\/\//i.test(u));
}

export function packMediaUrls(urls: string[]): string | null {
  const cleaned = urls
    .map((u) => u.trim())
    .filter((u) => /^https?:\/\//i.test(u));
  if (cleaned.length === 0) return null;
  return cleaned.join(SEP);
}

export function primaryMediaUrl(stored: string | null | undefined): string | null {
  return parseMediaUrls(stored)[0] ?? null;
}

// Loose check used everywhere to classify a URL as an image. Kept here so
// the regex is centralized — R2 signed URLs that end in `?X-Amz-...` get
// matched correctly.
const IMG_RE = /\.(jpg|jpeg|png|webp|gif|avif)(\?|$)/i;
const VIDEO_RE = /\.(mp4|mov|m4v|webm)(\?|$)/i;

export function isImageUrl(url: string): boolean {
  return IMG_RE.test(url);
}

export function isVideoUrl(url: string): boolean {
  return VIDEO_RE.test(url);
}
