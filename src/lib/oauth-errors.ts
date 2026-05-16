/**
 * OAuth error sanitization.
 *
 * The OAuth provider (Google/Meta/TikTok) sometimes redirects back with an
 * `?error=` query string when something goes wrong (`access_denied`,
 * `invalid_request`, `temporarily_unavailable`, etc.). We surface that to the
 * dashboard via `?connect_error=...`, but we must NOT trust the raw value —
 * a malicious upstream or a confused integration could send us a long string,
 * something with HTML, or anything else that ends up rendered or logged
 * unsafely.
 *
 * Rules:
 *  - Allow only short (≤ 32 char), lowercase + underscore + digit strings.
 *  - Anything else collapses to a single generic code so attackers can't use
 *    the dashboard URL as a content-injection vector.
 */
export function sanitizeProviderError(raw: string | null | undefined): string {
  if (!raw || typeof raw !== "string") return "provider_error";
  // Strict allowlist of OAuth-style error codes.
  if (/^[a-z0-9_]{1,32}$/.test(raw)) return raw;
  return "provider_error";
}
