/**
 * Env-var hygiene.
 *
 * Values copied into Vercel from a UTF-8-with-BOM .env.local will silently
 * carry a leading byte-order mark (U+FEFF). Most code paths don't care, but
 * OAuth providers reject client IDs with stray characters — and the BOM
 * happily encodes as `%EF%BB%BF` into URL query strings. AWS SigV4 has
 * an even meaner failure mode: it includes the bytes in the HMAC and the
 * resulting Authorization header trips Node's "Invalid character in header
 * content" check.
 *
 * Read every sensitive env var through `env()` and we get:
 *   - BOM stripped (anywhere in the string, not just edges — values copied
 *     from concatenated sources can have embedded BOMs)
 *   - ASCII control characters (\x00–\x1F + \x7F) stripped anywhere — this
 *     catches stray \r, NUL, vertical tabs etc. from broken copy-paste,
 *     none of which belong in a credential or URL.
 *   - Surrounding whitespace + quotes trimmed (people occasionally paste
 *     with quotes from JSON)
 *   - Undefined if the var is missing
 *
 * Things we deliberately DO NOT strip:
 *   - Non-ASCII printable chars — legitimate URLs / display names can use
 *     them, and the AWS SDK URL-encodes the right places anyway.
 *   - Internal whitespace — multi-word display names are valid.
 */
export function env(name: string): string | undefined {
  const raw = process.env[name];
  if (raw === undefined || raw === null) return undefined;
  return (
    raw
      // U+FEFF (byte-order mark) — strip from any position. Multi-paste
      // values can carry embedded BOMs even when the edges look clean.
      .replace(/﻿/g, "")
      // ASCII control chars (0x00–0x1F + 0x7F) anywhere — these have no
      // business being inside a credential, URL, or header value. Includes
      // NUL, BEL, ESC, DEL, and the various non-trimmable whitespace bytes
      // that aren't covered by String.prototype.trim().
      .replace(/[\x00-\x1F\x7F]/g, "")
      // Wrapping quotes (single, double, smart) from accidental paste of
      // a JSON string literal.
      .replace(/^["'“”‘’]+/, "")
      .replace(/["'“”‘’]+$/, "")
      .trim()
  );
}

/** Like env() but throws when missing. Use for must-have keys. */
export function requireEnv(name: string): string {
  const v = env(name);
  if (!v) throw new Error(`Missing required env var: ${name}`);
  return v;
}
