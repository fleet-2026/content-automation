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
// Tag prefix for music tracks packed into the same field. The visual-
// media parser filters by /^https?:\/\//i so it naturally ignores any
// line that begins with `audio::`, but `parseMusicUrl` looks for those
// lines explicitly. This avoids a Prisma schema migration just to add
// one nullable URL column.
const MUSIC_PREFIX = "audio::";

export function parseMediaUrls(stored: string | null | undefined): string[] {
  if (!stored) return [];
  return stored
    .split(SEP)
    .map((u) => u.trim())
    .filter((u) => /^https?:\/\//i.test(u));
}

/**
 * Pull out the optional background-music URL packed into the same
 * `mediaUrl` field. Returns null when no audio line is present.
 */
export function parseMusicUrl(stored: string | null | undefined): string | null {
  if (!stored) return null;
  for (const line of stored.split(SEP)) {
    const trimmed = line.trim();
    if (!trimmed.startsWith(MUSIC_PREFIX)) continue;
    const url = trimmed.slice(MUSIC_PREFIX.length).trim();
    if (/^https?:\/\//i.test(url)) return url;
  }
  return null;
}

/**
 * Pack visual media URLs (and optionally a background-music URL) into
 * a single newline-separated string for the `Draft.mediaUrl` column.
 * Visual URLs first; music line gets the `audio::` prefix.
 */
export function packMediaUrls(
  urls: string[],
  opts?: { musicUrl?: string | null },
): string | null {
  const cleaned = urls
    .map((u) => u.trim())
    .filter((u) => /^https?:\/\//i.test(u));
  const lines = [...cleaned];
  const music = opts?.musicUrl?.trim();
  if (music && /^https?:\/\//i.test(music)) {
    lines.push(`${MUSIC_PREFIX}${music}`);
  }
  if (lines.length === 0) return null;
  return lines.join(SEP);
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
