/**
 * Shared HMAC helpers for the TikTok mobile-caption bridge.
 *
 * Lives in /lib (not inside the route file) so BOTH the route handler
 * (/api/tt-caption) and the daily-post server action (getTikTokCaptionUrl)
 * can import it. Importing non-handler exports out of a Next.js `route.ts`
 * is unreliable in production builds — the named export can come back
 * undefined, which silently broke the QR-code generation.
 *
 * The HMAC is computed from slug + hour bucket + AUTH_SECRET, so a signed
 * link is valid for roughly an hour (current + previous bucket).
 */

import crypto from "node:crypto";

const SECRET = () => process.env.AUTH_SECRET ?? "fallback-caption-secret";

/** Generate an HMAC for a key (slug or draftId) + time bucket. */
export function captionHmac(key: string): { h: string; t: string } {
  const t = String(Math.floor(Date.now() / 3_600_000)); // hour bucket
  const h = crypto
    .createHmac("sha256", SECRET())
    .update(`${key}:${t}`)
    .digest("hex")
    .slice(0, 16);
  return { h, t };
}

/** Verify an HMAC. Accepts the current and previous hour bucket so links
 *  don't break the moment the clock ticks over to a new hour. */
export function verifyCaptionHmac(key: string, h: string): boolean {
  const now = Math.floor(Date.now() / 3_600_000);
  for (const bucket of [String(now), String(now - 1)]) {
    const expected = crypto
      .createHmac("sha256", SECRET())
      .update(`${key}:${bucket}`)
      .digest("hex")
      .slice(0, 16);
    if (h === expected) return true;
  }
  return false;
}
